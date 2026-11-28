import { beforeEach, describe, expect, it, vi } from "vitest";

type StoreRow = {
  id: string;
  apifyActorId: string;
  actorName: string;
  title: string;
  description: string | null;
  categories: null;
  metaLabels: null;
  websiteIdentityId: string | null;
  websiteConfidence: number | null;
  websiteMethod: string | null;
  websiteClassifiedAt: Date | null;
  websiteEvidence: unknown;
  websiteIdentity: { slug: string } | null;
  websiteAdminOverride: boolean;
};

const state = vi.hoisted(() => ({
  rows: [] as StoreRow[],
  rowIndex: new Map<string, StoreRow>(),
  identities: new Map<string, any>(),
  runs: [] as any[],
  privateActors: [] as any[],
  logos: [] as any[],
}));

const logoCatalog = vi.hoisted(() => ({
  deleteStoredWebsiteLogo: vi.fn(),
  discoverOfficialLogo: vi.fn(),
  isAutomaticallyTrustedLogoSource: vi.fn(),
  listStoredWebsiteLogos: vi.fn(),
  meetsAutoTrustQuality: vi.fn(),
  storeNormalizedWebsiteLogo: vi.fn(),
  verifyWebsiteLogoStorage: vi.fn(),
}));
const reconcileActorLogoRecommendations = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ created: 0 }),
);

const db = vi.hoisted(() => ({
  storeCatalogSync: {
    findFirst: vi.fn(async ({ where }: any) =>
      [...state.runs]
        .reverse()
        .find(
          (run) =>
            run.operation === where.operation &&
            where.status.in.includes(run.status) &&
            run.checkpoint !== null,
        ),
    ),
    create: vi.fn(async ({ data }: any) => {
      const run = {
        id: `run_${state.runs.length + 1}`,
        processedCount: 0,
        matchedCount: 0,
        unresolvedCount: 0,
        failedCount: 0,
        retryCount: 0,
        checkpoint: null,
        ...data,
      };
      state.runs.push(run);
      return run;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const run = state.runs.find((item) => item.id === where.id);
      Object.assign(run, data);
      return run;
    }),
  },
  websiteIdentity: {
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const existing = state.identities.get(where.slug);
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const identity = { id: `website_${where.slug}`, status: "ACTIVE", ...create };
      state.identities.set(where.slug, identity);
      return identity;
    }),
    findUnique: vi.fn(async ({ where }: any) => state.identities.get(where.slug) ?? null),
    findMany: vi.fn(async ({ where }: any = {}) =>
      [...state.identities.values()]
        .filter((identity) => {
          if (where?.currentLogoId === null) return !identity.currentLogoId;
          if (where?.currentLogoId?.not === null) return Boolean(identity.currentLogoId);
          return true;
        })
        .map((identity) => ({ logoAttempts: 0, ...identity })),
    ),
    update: vi.fn(async ({ where, data }: any) => {
      const identity = [...state.identities.values()].find((item) => item.id === where.id);
      if (identity) Object.assign(identity, data);
      return identity ?? {};
    }),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
  websiteLogo: {
    findUnique: vi.fn(
      async ({ where }: any) =>
        state.logos.find(
          (logo) =>
            logo.websiteIdentityId === where.websiteIdentityId_checksum.websiteIdentityId &&
            logo.checksum === where.websiteIdentityId_checksum.checksum,
        ) ?? null,
    ),
    findMany: vi.fn(async ({ where }: any) =>
      where?.storagePath
        ? state.logos.filter((logo) => where.storagePath.in.includes(logo.storagePath))
        : [],
    ),
    deleteMany: vi.fn(async () => ({ count: 0 })),
    upsert: vi.fn(async ({ where, create }: any) => {
      const existing = state.logos.find(
        (logo) =>
          logo.websiteIdentityId === where.websiteIdentityId_checksum.websiteIdentityId &&
          logo.checksum === where.websiteIdentityId_checksum.checksum,
      );
      if (existing) return existing;
      const logo = { id: `logo_${state.logos.length + 1}`, ...create };
      state.logos.push(logo);
      return logo;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const logo = state.logos.find((item) => item.id === where.id);
      if (logo) Object.assign(logo, data);
      return logo ?? {};
    }),
  },
  actorLogoRecommendation: {
    updateMany: vi.fn(async () => ({ count: 0 })),
    createMany: vi.fn(async ({ data }: any) => ({ count: data.length })),
  },
  notification: {
    createMany: vi.fn(async ({ data }: any) => ({ count: data.length })),
  },
  storeActor: {
    count: vi.fn(async () => state.rows.filter((row) => !row.websiteAdminOverride).length),
    findMany: vi.fn(async ({ cursor, skip, take, select }: any) => {
      const eligible = state.rows.filter((row) => !row.websiteAdminOverride);
      if (select?.apifyActorId && take === undefined) {
        return eligible.map((row) => ({ apifyActorId: row.apifyActorId }));
      }
      const start = cursor
        ? Math.max(0, eligible.findIndex((row) => row.id === cursor.id) + (skip ?? 0))
        : 0;
      return eligible.slice(start, start + take);
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = state.rowIndex.get(where.id)!;
      Object.assign(row, data, {
        websiteIdentity: data.websiteIdentityId
          ? {
              slug: [...state.identities.values()].find(
                (item) => item.id === data.websiteIdentityId,
              )?.slug,
            }
          : null,
      });
      return row;
    }),
  },
  actor: {
    updateMany: vi.fn(async () => ({ count: 0 })),
    findMany: vi.fn(async () => state.privateActors.filter((actor) => !actor.websiteAdminOverride)),
    update: vi.fn(async ({ where, data }: any) => {
      const actor = state.privateActors.find((item) => item.id === where.id);
      if (actor) {
        Object.assign(actor, data, {
          websiteIdentity: data.websiteIdentityId
            ? {
                slug: [...state.identities.values()].find(
                  (item) => item.id === data.websiteIdentityId,
                )?.slug,
              }
            : null,
        });
      }
      return actor ?? {};
    }),
  },
  $transaction: vi.fn(async (input: any) =>
    typeof input === "function" ? input(db) : Promise.all(input),
  ),
}));

vi.mock("@actorconsole/db", () => ({
  db,
  Prisma: { DbNull: null },
  reconcileActorLogoRecommendations,
}));
vi.mock("@actorconsole/logo-catalog", () => logoCatalog);

import {
  classifyWebsiteCatalog,
  cleanupWebsiteLogoStorage,
  enrichWebsiteLogos,
  nextLogoAttemptAt,
} from "../../src/lib/website-catalog.js";

const checksum = "a".repeat(64);
const discovered = (overrides: Record<string, unknown> = {}) => ({
  bytes: Buffer.from("official-logo"),
  finalUrl: "https://maps.google.com/logo.svg",
  sourceKind: "OFFICIAL_BRAND",
  normalized: {
    bytes: Buffer.from("normalized"),
    checksum,
    contentType: "image/webp",
    width: 512,
    height: 512,
    byteSize: 1_024,
    source: { width: 512, height: 512, vector: false },
  },
  ...overrides,
});
const storedLogo = {
  storagePath: `website-logos/website_google-maps/${checksum}.webp`,
  checksum,
  contentType: "image/webp",
  width: 512,
  height: 512,
  byteSize: 1_024,
};
function googleMaps(extra: Record<string, unknown> = {}) {
  state.identities.set("google-maps", {
    id: "website_google-maps",
    slug: "google-maps",
    name: "Google Maps",
    canonicalDomain: "maps.google.com",
    status: "ACTIVE",
    currentLogoId: null,
    logoAttempts: 0,
    ...extra,
  });
}

function rows(count: number): StoreRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `actor_${String(index).padStart(6, "0")}`,
    apifyActorId: `apify_${index}`,
    actorName: `google-maps-${index}`,
    title: "Google Maps Scraper",
    description: "Collect place records",
    categories: null,
    metaLabels: null,
    websiteIdentityId: null,
    websiteConfidence: null,
    websiteMethod: null,
    websiteClassifiedAt: null,
    websiteEvidence: null,
    websiteIdentity: null,
    websiteAdminOverride: false,
  }));
}

describe("website catalog backfill", () => {
  beforeEach(() => {
    state.rows = [];
    state.rowIndex.clear();
    state.identities.clear();
    state.runs = [];
    state.privateActors = [];
    state.logos = [];
    vi.clearAllMocks();
    logoCatalog.verifyWebsiteLogoStorage.mockResolvedValue({ path: "/tmp/actorconsole-assets" });
  });

  it("processes 50k+ Actors in bounded batches and skips unchanged writes on a repeat run", async () => {
    state.rows = rows(50_001);
    state.rowIndex = new Map(state.rows.map((row) => [row.id, row]));
    const first = await classifyWebsiteCatalog({ batchSize: 500 });
    expect(first).toMatchObject({
      expectedCount: 50_001,
      processedCount: 50_001,
      matchedCount: 50_001,
      failedCount: 0,
    });
    expect(db.storeActor.findMany).toHaveBeenCalledTimes(103);
    expect(db.storeActor.update).toHaveBeenCalledTimes(50_001);

    const writeCount = db.storeActor.update.mock.calls.length;
    const second = await classifyWebsiteCatalog({ batchSize: 500 });
    expect(second.processedCount).toBe(50_001);
    expect(db.storeActor.update).toHaveBeenCalledTimes(writeCount);
    expect(reconcileActorLogoRecommendations).toHaveBeenCalledTimes(2);
  }, 60_000);

  it("resumes after the last persisted Actor checkpoint", async () => {
    state.rows = rows(100);
    state.rowIndex = new Map(state.rows.map((row) => [row.id, row]));
    state.runs.push({
      id: "interrupted",
      operation: "WEBSITE_CLASSIFICATION",
      status: "FAILED",
      expectedCount: 100,
      processedCount: 50,
      matchedCount: 50,
      unresolvedCount: 0,
      failedCount: 0,
      retryCount: 0,
      checkpoint: state.rows[49]!.id,
      completedAt: new Date(),
    });
    const result = await classifyWebsiteCatalog({ batchSize: 25, retryCount: 1 });
    expect(result).toMatchObject({ processedCount: 100, matchedCount: 100, retryCount: 1 });
    expect(db.storeActor.update).toHaveBeenCalledTimes(50);
    expect(state.runs[0]).toMatchObject({ status: "COMPLETED", checkpoint: null });
  });

  it("deduplicates concurrent identities discovered from the same domain", async () => {
    state.rows = rows(25).map((row, index) => ({
      ...row,
      actorName: `example-${index}`,
      title: "Example data scraper",
      description: "Collect public data from https://example.com/catalog",
    }));
    state.rowIndex = new Map(state.rows.map((row) => [row.id, row]));

    const result = await classifyWebsiteCatalog({ batchSize: 25, concurrency: 25 });

    expect(result).toMatchObject({ processedCount: 25, matchedCount: 25, failedCount: 0 });
    expect(
      db.websiteIdentity.upsert.mock.calls.filter(([input]) => input.where.slug === "example-com"),
    ).toHaveLength(1);
  });

  it("waits for a website identity created concurrently by another worker process", async () => {
    state.rows = rows(1).map((row) => ({
      ...row,
      actorName: "example-catalog",
      title: "Example data scraper",
      description: "Collect public data from https://example.com/catalog",
    }));
    state.rowIndex = new Map(state.rows.map((row) => [row.id, row]));

    const baseUpsert = db.websiteIdentity.upsert.getMockImplementation()!;
    db.websiteIdentity.upsert.mockImplementation(async (input: any) => {
      if (input.where.slug !== "example-com") return baseUpsert(input);
      state.identities.set("example-com", {
        id: "website_example-com",
        slug: "example-com",
        name: "Example",
        canonicalDomain: "example.com",
        aliases: ["example.com"],
        status: "ACTIVE",
      });
      throw Object.assign(new Error("unique race"), { code: "P2002" });
    });
    db.websiteIdentity.findUnique
      .mockResolvedValueOnce(null)
      .mockImplementation(async ({ where }: any) => state.identities.get(where.slug) ?? null);

    const result = await classifyWebsiteCatalog({ batchSize: 25, concurrency: 1 });

    expect(result).toMatchObject({ processedCount: 1, matchedCount: 1, failedCount: 0 });
    expect(db.websiteIdentity.findUnique).toHaveBeenCalledTimes(2);
  });

  it("classifies private workspace Actors independently and never overwrites an admin assignment", async () => {
    state.privateActors = [
      {
        id: "private_1",
        actorName: "bing-search",
        title: "Bing Search Scraper",
        description: "Search Bing",
        currentCopy: { readme: "Uses bing.com" },
        websiteIdentityId: null,
        websiteEvidence: null,
        websiteIdentity: null,
        websiteAdminOverride: false,
        storeIsPublic: false,
      },
      {
        id: "private_admin",
        actorName: "instagram",
        title: "Instagram Scraper",
        description: null,
        currentCopy: null,
        websiteIdentityId: "manual_website",
        websiteEvidence: null,
        websiteIdentity: { slug: "manual" },
        websiteAdminOverride: true,
        storeIsPublic: false,
      },
    ];
    const result = await classifyWebsiteCatalog({ batchSize: 25 });
    expect(result).toMatchObject({ expectedCount: 1, processedCount: 1, matchedCount: 1 });
    expect(state.privateActors[0]).toMatchObject({
      websiteIdentity: { slug: "bing" },
      websiteMethod: "EXACT_ALIAS",
    });
    expect(state.privateActors[1]).toMatchObject({ websiteIdentityId: "manual_website" });
    expect(db.actor.update).toHaveBeenCalledTimes(1);
  });

  it("reclassifies unmatched public workspace Actors and ignores invalid legacy domain aliases", async () => {
    state.identities.set("robots-txt", {
      id: "website_robots-txt",
      slug: "robots-txt",
      name: "Robots",
      canonicalDomain: "robots.txt",
      aliases: ["robots.txt"],
      status: "LOGO_FAILED",
    });
    state.privateActors = [
      {
        id: "workspace_public_without_store_row",
        apifyActorId: "missing_from_store_catalog",
        actorName: "sitemap-sniffer",
        title: "Sitemap Sniffer",
        description: "Reads robots.txt for Sitemap directives and probes common sitemap paths.",
        currentCopy: null,
        websiteIdentityId: "website_robots-txt",
        websiteEvidence: {
          sourceHash: "legacy",
          match: { field: "description", value: "robots.txt" },
        },
        websiteIdentity: { slug: "robots-txt" },
        websiteAdminOverride: false,
        storeIsPublic: true,
      },
    ];

    const result = await classifyWebsiteCatalog({ batchSize: 25 });

    expect(result).toMatchObject({ expectedCount: 1, processedCount: 1, unresolvedCount: 1 });
    expect(state.privateActors[0]).toMatchObject({
      websiteIdentity: { slug: "generic-web-data" },
      websiteMethod: "GENERIC",
    });
  });

  it("fails the enrichment run without marking websites failed when storage is unavailable", async () => {
    state.identities.set("linkedin", {
      id: "website_linkedin",
      slug: "linkedin",
      name: "LinkedIn",
      canonicalDomain: "linkedin.com",
      status: "ACTIVE",
    });
    logoCatalog.verifyWebsiteLogoStorage.mockRejectedValueOnce(
      new Error("Could not load the default credentials"),
    );

    const result = await enrichWebsiteLogos({ limit: 10, delayMs: 0 });

    expect(result).toMatchObject({
      expectedCount: 1,
      processedCount: 0,
      failedCount: 0,
      error: expect.stringContaining("storage is unavailable"),
    });
    expect(state.identities.get("linkedin")).toMatchObject({ status: "ACTIVE" });
    expect(state.runs[0]).toMatchObject({
      status: "FAILED",
      processedCount: 0,
      failedCount: 0,
      error: expect.stringContaining("default credentials"),
    });
    expect(logoCatalog.discoverOfficialLogo).not.toHaveBeenCalled();
  });

  it("activates a trusted official logo and creates one deduplicated notification per workspace", async () => {
    state.identities.set("google-maps", {
      id: "website_google-maps",
      slug: "google-maps",
      name: "Google Maps",
      canonicalDomain: "maps.google.com",
      status: "ACTIVE",
      currentLogoId: null,
    });
    state.privateActors = [
      {
        id: "actor_1",
        userId: "user_1",
        businessProfileId: "workspace_1",
        websiteIdentityId: "website_google-maps",
        websiteAdminOverride: false,
      },
      {
        id: "actor_2",
        userId: "user_1",
        businessProfileId: "workspace_1",
        websiteIdentityId: "website_google-maps",
        websiteAdminOverride: false,
      },
    ];
    logoCatalog.discoverOfficialLogo.mockResolvedValue(discovered());
    logoCatalog.storeNormalizedWebsiteLogo.mockResolvedValue(storedLogo);
    logoCatalog.isAutomaticallyTrustedLogoSource.mockReturnValue(true);
    logoCatalog.meetsAutoTrustQuality.mockReturnValue(true);

    const result = await enrichWebsiteLogos({ limit: 10, delayMs: 0 });

    expect(result).toMatchObject({ processedCount: 1, matchedCount: 1, failedCount: 0 });
    expect(state.identities.get("google-maps")).toMatchObject({
      currentLogoId: "logo_1",
      status: "ACTIVE",
      logoError: null,
    });
    expect(reconcileActorLogoRecommendations).toHaveBeenCalledWith(
      { websiteIdentityId: "website_google-maps" },
      db,
    );
    expect(db.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          businessProfileId: "workspace_1",
          dedupeKey: "website-logo:logo_1:workspace:workspace_1",
          body: expect.stringContaining("2 Actors"),
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("holds a trusted but low-quality logo for admin review instead of activating it", async () => {
    googleMaps();
    logoCatalog.discoverOfficialLogo.mockResolvedValue(
      discovered({
        normalized: { ...discovered().normalized, source: { width: 32, height: 32, vector: false } },
      }),
    );
    logoCatalog.storeNormalizedWebsiteLogo.mockResolvedValue(storedLogo);
    logoCatalog.isAutomaticallyTrustedLogoSource.mockReturnValue(true);
    logoCatalog.meetsAutoTrustQuality.mockReturnValue(false);

    await enrichWebsiteLogos({ limit: 10, delayMs: 0 });

    expect(state.logos[0]).toMatchObject({
      reviewStatus: "PENDING",
      reviewNotes: expect.stringContaining("32×32"),
    });
    expect(state.identities.get("google-maps").currentLogoId).toBeNull();
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it("backs off exponentially after failed lookups", async () => {
    googleMaps({ logoAttempts: 2 });
    logoCatalog.discoverOfficialLogo.mockRejectedValue(new Error("HTTP 503"));
    const now = new Date("2026-11-28T00:00:00Z");

    await enrichWebsiteLogos({ limit: 10, delayMs: 0, now });

    expect(state.identities.get("google-maps")).toMatchObject({
      status: "LOGO_FAILED",
      logoError: "HTTP 503",
      logoAttempts: 3,
      logoNextAttemptAt: new Date("2026-12-02T00:00:00Z"),
    });
    expect(nextLogoAttemptAt(1, now)).toEqual(new Date("2026-11-29T00:00:00Z"));
    expect(nextLogoAttemptAt(20, now)).toEqual(new Date("2026-12-28T00:00:00Z"));
  });

  it("re-checks an existing logo and only records the check when it is unchanged", async () => {
    googleMaps({ currentLogoId: "logo_1", logoCheckedAt: null });
    state.logos.push({ id: "logo_1", websiteIdentityId: "website_google-maps", checksum });
    logoCatalog.discoverOfficialLogo.mockResolvedValue(discovered());
    const now = new Date("2026-11-28T00:00:00Z");

    const result = await enrichWebsiteLogos({ limit: 10, delayMs: 0, now });

    expect(result).toMatchObject({ processedCount: 1, matchedCount: 1 });
    expect(logoCatalog.storeNormalizedWebsiteLogo).not.toHaveBeenCalled();
    expect(state.identities.get("google-maps")).toMatchObject({
      currentLogoId: "logo_1",
      logoCheckedAt: now,
    });
  });

  it("sends a changed logo on a refreshed website to review without replacing the current one", async () => {
    googleMaps({ currentLogoId: "logo_1", logoCheckedAt: null });
    state.logos.push({
      id: "logo_1",
      websiteIdentityId: "website_google-maps",
      checksum: "b".repeat(64),
    });
    logoCatalog.discoverOfficialLogo.mockResolvedValue(discovered());
    logoCatalog.storeNormalizedWebsiteLogo.mockResolvedValue(storedLogo);
    logoCatalog.isAutomaticallyTrustedLogoSource.mockReturnValue(true);
    logoCatalog.meetsAutoTrustQuality.mockReturnValue(true);

    await enrichWebsiteLogos({ limit: 10, delayMs: 0 });

    expect(state.logos[1]).toMatchObject({
      reviewStatus: "PENDING",
      reviewNotes: expect.stringContaining("different logo"),
    });
    expect(state.identities.get("google-maps").currentLogoId).toBe("logo_1");
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it("keeps a working logo when a refresh lookup fails", async () => {
    googleMaps({ currentLogoId: "logo_1", logoCheckedAt: null });
    logoCatalog.discoverOfficialLogo.mockRejectedValue(new Error("timeout"));
    await enrichWebsiteLogos({ limit: 10, delayMs: 0 });
    expect(state.identities.get("google-maps")).toMatchObject({
      status: "ACTIVE",
      currentLogoId: "logo_1",
    });
  });

  it("never re-approves a logo an admin rejected when the website still shows it", async () => {
    googleMaps();
    state.logos.push({
      id: "logo_rejected",
      websiteIdentityId: "website_google-maps",
      checksum,
      reviewStatus: "REJECTED",
    });
    logoCatalog.discoverOfficialLogo.mockResolvedValue(discovered());
    logoCatalog.isAutomaticallyTrustedLogoSource.mockReturnValue(true);
    logoCatalog.meetsAutoTrustQuality.mockReturnValue(true);

    const result = await enrichWebsiteLogos({ limit: 10, delayMs: 0 });

    expect(result).toMatchObject({ failedCount: 1 });
    expect(state.identities.get("google-maps")).toMatchObject({
      currentLogoId: null,
      status: "LOGO_FAILED",
      logoAttempts: 1,
      logoError: expect.stringContaining("rejected"),
    });
    expect(state.logos[0]!.reviewStatus).toBe("REJECTED");
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  describe("storage cleanup", () => {
    const old = new Date("2026-10-01T00:00:00Z");
    const now = new Date("2026-11-28T00:00:00Z");
    const known = `website-logos/site_1/${"c".repeat(64)}.webp`;
    const orphan = `website-logos/site_1/${"d".repeat(64)}.webp`;
    const fresh = `website-logos/site_1/${"e".repeat(64)}.webp`;

    beforeEach(() => {
      state.logos.push({ id: "logo_known", storagePath: known });
      logoCatalog.listStoredWebsiteLogos.mockImplementation(async function* () {
        yield { storagePath: known, lastModified: old };
        yield { storagePath: orphan, lastModified: old };
        // Written moments ago, before its database row: must be kept.
        yield { storagePath: fresh, lastModified: new Date(now.getTime() - 60_000) };
      });
    });

    it("only reports orphaned files by default", async () => {
      const summary = await cleanupWebsiteLogoStorage({ now });
      expect(summary).toMatchObject({ scanned: 3, orphaned: 1, deleted: 0, dryRun: true });
      expect(logoCatalog.deleteStoredWebsiteLogo).not.toHaveBeenCalled();
    });

    it("deletes only old files that no logo row refers to", async () => {
      const summary = await cleanupWebsiteLogoStorage({ now, remove: true });
      expect(summary).toMatchObject({ orphaned: 1, deleted: 1, dryRun: false });
      expect(logoCatalog.deleteStoredWebsiteLogo).toHaveBeenCalledTimes(1);
      expect(logoCatalog.deleteStoredWebsiteLogo).toHaveBeenCalledWith(orphan);
    });
  });
});
