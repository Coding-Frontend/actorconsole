import { createHash } from "node:crypto";
import { db, Prisma } from "@actorconsole/db";
import {
  CORE_WEBSITE_IDENTITIES,
  classifyActorWebsite,
  extractPublicDomains,
  type WebsiteIdentitySeed,
} from "@actorconsole/shared";
import {
  discoverOfficialLogo,
  isAutomaticallyTrustedLogoSource,
  storeWebsiteLogo,
  verifyWebsiteLogoStorage,
} from "@actorconsole/logo-catalog";

const GENERIC_SLUG = "generic-web-data";
const MULTI_SITE_SLUG = "multi-site";
const CLASSIFICATION_VERSION = 2;

function titleCaseDomain(domain: string) {
  const base = domain.replace(/^www\./, "").split(".")[0] || domain;
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function domainSlug(domain: string) {
  return domain
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export type WebsiteCatalogResult = {
  expectedCount: number;
  processedCount: number;
  matchedCount: number;
  unresolvedCount: number;
  failedCount: number;
  retryCount: number;
  error?: string;
};

async function createRun(operation: string, expectedCount: number) {
  const interrupted = await db.storeCatalogSync.findFirst({
    where: { operation, status: { in: ["RUNNING", "FAILED"] }, checkpoint: { not: null } },
    orderBy: { startedAt: "desc" },
  });
  if (interrupted) {
    return db.storeCatalogSync.update({
      where: { id: interrupted.id },
      data: { status: "RUNNING", expectedCount, error: null, completedAt: null },
    });
  }
  return db.storeCatalogSync.create({ data: { operation, status: "RUNNING", expectedCount } });
}

async function saveRun(
  id: string,
  result: WebsiteCatalogResult,
  status = "RUNNING",
  error?: string,
  checkpoint?: string | null,
) {
  await db.storeCatalogSync.update({
    where: { id },
    data: {
      status,
      expectedCount: result.expectedCount,
      processedCount: result.processedCount,
      matchedCount: result.matchedCount,
      unresolvedCount: result.unresolvedCount,
      failedCount: result.failedCount,
      retryCount: result.retryCount,
      ...(checkpoint === undefined ? {} : { checkpoint }),
      error: error?.slice(0, 65_535) ?? null,
      ...(status === "RUNNING" ? {} : { completedAt: new Date() }),
    },
  });
}

function classificationSourceHash(input: {
  actorName: string;
  title: string | null;
  description: string | null;
  metadata?: unknown;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify([input.actorName, input.title, input.description, input.metadata ?? null]),
    )
    .digest("hex");
}

function storedSourceHash(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const hash = (value as { sourceHash?: unknown }).sourceHash;
  return typeof hash === "string" ? hash : null;
}

function storedClassificationVersion(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const version = (value as { classificationVersion?: unknown }).classificationVersion;
  return typeof version === "number" ? version : null;
}

function classificationEvidence(evidence: unknown, sourceHash: string) {
  return {
    match: evidence,
    sourceHash,
    classificationVersion: CLASSIFICATION_VERSION,
  } as Prisma.InputJsonValue;
}

export async function ensureCoreWebsiteIdentities() {
  for (const identity of CORE_WEBSITE_IDENTITIES) {
    await db.websiteIdentity.upsert({
      where: { slug: identity.slug },
      create: {
        slug: identity.slug,
        name: identity.name,
        canonicalDomain: identity.canonicalDomain ?? null,
        aliases: identity.aliases as Prisma.InputJsonValue,
      },
      update: {
        name: identity.name,
        canonicalDomain: identity.canonicalDomain ?? null,
        aliases: identity.aliases as Prisma.InputJsonValue,
      },
    });
  }
  return db.websiteIdentity.findMany({ where: { status: "ACTIVE" } });
}

type WebsiteIdentityRecord = Awaited<ReturnType<typeof ensureCoreWebsiteIdentities>>[number];
const pendingDomainIdentityUpserts = new Map<string, Promise<WebsiteIdentityRecord>>();

async function findIdentityAfterUniqueRace(slug: string) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const identity = await db.websiteIdentity.findUnique({ where: { slug } });
    if (identity) return identity;
    await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
  }
  return null;
}

async function ensureDomainWebsiteIdentity(
  domain: string,
  identities: WebsiteIdentityRecord[],
): Promise<WebsiteIdentityRecord> {
  const slug = domainSlug(domain);
  const cached = identities.find((identity) => identity.slug === slug);
  if (cached) return cached;

  let pending = pendingDomainIdentityUpserts.get(slug);
  if (!pending) {
    pending = (async () => {
      try {
        return await db.websiteIdentity.upsert({
          where: { slug },
          create: {
            slug,
            name: titleCaseDomain(domain),
            canonicalDomain: domain,
            aliases: [domain] as Prisma.InputJsonValue,
          },
          update: {},
        });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
          // MySQL can report the competing unique insert before that transaction is
          // visible to this connection. Retry the lookup so parallel worker processes
          // converge on the same identity instead of failing individual Actors.
          const racedIdentity = await findIdentityAfterUniqueRace(slug);
          if (racedIdentity) return racedIdentity;
        }
        throw error;
      }
    })();
    pendingDomainIdentityUpserts.set(slug, pending);
  }

  try {
    const identity = await pending;
    if (!identities.some((item) => item.id === identity.id)) identities.push(identity);
    return identity;
  } finally {
    if (pendingDomainIdentityUpserts.get(slug) === pending) {
      pendingDomainIdentityUpserts.delete(slug);
    }
  }
}

function classifierSeeds(
  identities: Awaited<ReturnType<typeof ensureCoreWebsiteIdentities>>,
): WebsiteIdentitySeed[] {
  const coreSlugs = new Set(CORE_WEBSITE_IDENTITIES.map((identity) => identity.slug));
  return identities
    .filter(
      (identity) =>
        coreSlugs.has(identity.slug) ||
        (identity.canonicalDomain !== null &&
          extractPublicDomains(identity.canonicalDomain).length === 1),
    )
    .map((identity) => ({
      slug: identity.slug,
      name: identity.name,
      canonicalDomain: identity.canonicalDomain,
      aliases: Array.isArray(identity.aliases)
        ? identity.aliases.filter((value): value is string => typeof value === "string")
        : [],
    }));
}

async function resolveClassification(
  input: {
    actorName: string;
    title: string | null;
    description: string | null;
    metadata?: unknown;
  },
  identities: Awaited<ReturnType<typeof ensureCoreWebsiteIdentities>>,
) {
  const result = classifyActorWebsite(input, classifierSeeds(identities));
  if (result.slug !== GENERIC_SLUG) {
    const identity = identities.find((item) => item.slug === result.slug);
    if (identity) return { identity, result };
  }
  const domains = extractPublicDomains(
    [input.title, input.actorName, input.description, JSON.stringify(input.metadata ?? null)]
      .filter(Boolean)
      .join(" "),
  );
  if (domains.length === 1) {
    const domain = domains[0];
    const slug = domainSlug(domain);
    const identity = await ensureDomainWebsiteIdentity(domain, identities);
    return {
      identity,
      result: {
        slug,
        confidence: 0.82,
        method: "DOMAIN",
        evidence: { field: "domain", value: domain },
      },
    };
  }
  if (domains.length > 1) {
    const identity = identities.find((item) => item.slug === MULTI_SITE_SLUG)!;
    return {
      identity,
      result: {
        slug: MULTI_SITE_SLUG,
        confidence: 0.6,
        method: "MULTI_SITE",
        evidence: { field: "domains", value: domains.join(", ") },
      },
    };
  }
  const identity =
    identities.find((item) => item.slug === result.slug) ??
    identities.find((item) => item.slug === GENERIC_SLUG)!;
  return { identity, result };
}

export async function classifyWebsiteCatalog(
  options: { batchSize?: number; concurrency?: number; retryCount?: number } = {},
) {
  const batchSize = Math.min(Math.max(options.batchSize ?? 500, 25), 1_000);
  const concurrency = Math.min(Math.max(options.concurrency ?? 25, 1), 50);
  const identities = await ensureCoreWebsiteIdentities();
  const expectedCount = await db.storeActor.count({ where: { websiteAdminOverride: false } });
  const run = await createRun("WEBSITE_CLASSIFICATION", expectedCount);
  const result: WebsiteCatalogResult = {
    expectedCount,
    processedCount: run.processedCount,
    matchedCount: run.matchedCount,
    unresolvedCount: run.unresolvedCount,
    failedCount: run.failedCount,
    retryCount: Math.max(run.retryCount, options.retryCount ?? 0),
  };
  let cursor: string | undefined = run.checkpoint ?? undefined;
  try {
    while (true) {
      const actors = await db.storeActor.findMany({
        where: { websiteAdminOverride: false },
        orderBy: { id: "asc" },
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          apifyActorId: true,
          actorName: true,
          title: true,
          description: true,
          categories: true,
          metaLabels: true,
          websiteIdentityId: true,
          websiteEvidence: true,
          websiteIdentity: { select: { slug: true } },
        },
      });
      if (!actors.length) break;
      for (let offset = 0; offset < actors.length; offset += concurrency) {
        const outcomes = await Promise.all(
          actors.slice(offset, offset + concurrency).map(async (actor) => {
            const input = {
              actorName: actor.actorName,
              title: actor.title,
              description: actor.description,
              metadata: { categories: actor.categories, metaLabels: actor.metaLabels },
            };
            const sourceHash = classificationSourceHash(input);
            try {
              if (
                actor.websiteIdentityId &&
                actor.websiteIdentity &&
                storedSourceHash(actor.websiteEvidence) === sourceHash &&
                storedClassificationVersion(actor.websiteEvidence) === CLASSIFICATION_VERSION
              ) {
                return actor.websiteIdentity.slug === GENERIC_SLUG ? "unresolved" : "matched";
              }
              const { identity, result: classification } = await resolveClassification(
                input,
                identities,
              );
              const data = {
                websiteIdentityId: identity.id,
                websiteConfidence: classification.confidence,
                websiteMethod: classification.method,
                websiteEvidence: classificationEvidence(classification.evidence, sourceHash),
                websiteClassificationError: null,
                websiteClassifiedAt: new Date(),
              };
              await db.$transaction([
                db.storeActor.update({ where: { id: actor.id }, data }),
                db.actor.updateMany({
                  where: { apifyActorId: actor.apifyActorId, websiteAdminOverride: false },
                  data,
                }),
              ]);
              return identity.slug === GENERIC_SLUG ? "unresolved" : "matched";
            } catch (error) {
              await db.storeActor
                .update({
                  where: { id: actor.id },
                  data: {
                    websiteClassificationError: (error instanceof Error
                      ? error.message
                      : String(error)
                    ).slice(0, 65_535),
                  },
                })
                .catch(() => undefined);
              return "failed";
            }
          }),
        );
        for (const outcome of outcomes) {
          result.matchedCount += outcome === "matched" ? 1 : 0;
          result.unresolvedCount += outcome === "unresolved" ? 1 : 0;
          result.failedCount += outcome === "failed" ? 1 : 0;
          result.processedCount += 1;
        }
      }
      cursor = actors.at(-1)?.id;
      await saveRun(run.id, result, "RUNNING", undefined, cursor);
    }
    const storeActorIds = new Set(
      (
        await db.storeActor.findMany({
          select: { apifyActorId: true },
        })
      ).map((actor) => actor.apifyActorId),
    );
    const privateActors = (
      await db.actor.findMany({
        where: { websiteAdminOverride: false },
        select: {
          id: true,
          apifyActorId: true,
          actorName: true,
          title: true,
          description: true,
          currentCopy: true,
          websiteIdentityId: true,
          websiteEvidence: true,
          websiteIdentity: { select: { slug: true } },
        },
      })
    ).filter((actor) => !storeActorIds.has(actor.apifyActorId));
    result.expectedCount += privateActors.length;
    for (const actor of privateActors) {
      const input = {
        actorName: actor.actorName,
        title: actor.title,
        description: actor.description,
        metadata: actor.currentCopy,
      };
      const sourceHash = classificationSourceHash(input);
      try {
        if (
          actor.websiteIdentityId &&
          actor.websiteIdentity &&
          storedSourceHash(actor.websiteEvidence) === sourceHash &&
          storedClassificationVersion(actor.websiteEvidence) === CLASSIFICATION_VERSION
        ) {
          result.matchedCount += actor.websiteIdentity.slug === GENERIC_SLUG ? 0 : 1;
          result.unresolvedCount += actor.websiteIdentity.slug === GENERIC_SLUG ? 1 : 0;
        } else {
          const { identity, result: classification } = await resolveClassification(
            input,
            identities,
          );
          await db.actor.update({
            where: { id: actor.id },
            data: {
              websiteIdentityId: identity.id,
              websiteConfidence: classification.confidence,
              websiteMethod: classification.method,
              websiteEvidence: classificationEvidence(classification.evidence, sourceHash),
              websiteClassificationError: null,
              websiteClassifiedAt: new Date(),
            },
          });
          result.matchedCount += identity.slug === GENERIC_SLUG ? 0 : 1;
          result.unresolvedCount += identity.slug === GENERIC_SLUG ? 1 : 0;
        }
      } catch (error) {
        result.failedCount += 1;
        await db.actor.update({
          where: { id: actor.id },
          data: {
            websiteClassificationError: (error instanceof Error
              ? error.message
              : String(error)
            ).slice(0, 65_535),
          },
        });
      }
      result.processedCount += 1;
    }
    // Rule changes can move Actors away from an automatically-created domain
    // identity. Archive the now-empty identity so filenames or stale domains
    // are not offered to administrators or sent to logo enrichment forever.
    await db.websiteIdentity.updateMany({
      where: {
        slug: { notIn: CORE_WEBSITE_IDENTITIES.map((identity) => identity.slug) },
        storeActors: { none: {} },
        actors: { none: {} },
        logos: { none: {} },
      },
      data: { status: "ARCHIVED" },
    });
    await saveRun(run.id, result, result.failedCount ? "PARTIAL" : "COMPLETED", undefined, null);
    return result;
  } catch (error) {
    await saveRun(
      run.id,
      result,
      "FAILED",
      error instanceof Error ? error.message : String(error),
      cursor,
    );
    throw error;
  }
}

async function activateTrustedLogo(input: {
  website: { id: string; name: string };
  logoId: string;
}) {
  const actors = await db.actor.findMany({
    where: { websiteIdentityId: input.website.id },
    select: { id: true, userId: true, businessProfileId: true },
  });
  await db.$transaction(async (tx) => {
    await tx.websiteLogo.update({
      where: { id: input.logoId },
      data: { reviewStatus: "APPROVED", reviewedAt: new Date() },
    });
    await tx.websiteIdentity.update({
      where: { id: input.website.id },
      data: { currentLogoId: input.logoId, status: "ACTIVE", logoError: null },
    });
    if (!actors.length) return;
    await tx.actorLogoRecommendation.updateMany({
      where: {
        actorId: { in: actors.map((actor) => actor.id) },
        status: "PENDING",
        logoId: { not: input.logoId },
      },
      data: { status: "SUPERSEDED", error: null },
    });
    await tx.actorLogoRecommendation.createMany({
      data: actors.map((actor) => ({ actorId: actor.id, logoId: input.logoId })),
      skipDuplicates: true,
    });
    const workspaces = new Map<
      string,
      { userId: string; businessProfileId: string; count: number }
    >();
    for (const actor of actors) {
      const current = workspaces.get(actor.businessProfileId);
      workspaces.set(actor.businessProfileId, {
        userId: actor.userId,
        businessProfileId: actor.businessProfileId,
        count: (current?.count ?? 0) + 1,
      });
    }
    await tx.notification.createMany({
      data: [...workspaces.values()].map((workspace) => ({
        userId: workspace.userId,
        businessProfileId: workspace.businessProfileId,
        type: "WEBSITE_LOGO_RECOMMENDATION",
        title: `A reviewed ${input.website.name} logo is available`,
        body: `${workspace.count} Actor${workspace.count === 1 ? "" : "s"} can use the official website logo. Review it before updating Apify.`,
        link: "/dashboard/actors?logoStatus=pending",
        dedupeKey: `website-logo:${input.logoId}:workspace:${workspace.businessProfileId}`,
      })),
      skipDuplicates: true,
    });
  });
}

export async function enrichWebsiteLogos(
  options: { limit?: number; retryCount?: number; delayMs?: number } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const delayMs = Math.min(Math.max(options.delayMs ?? 150, 0), 10_000);
  const websites = await db.websiteIdentity.findMany({
    where: {
      status: { in: ["ACTIVE", "LOGO_FAILED"] },
      currentLogoId: null,
      logos: { none: { reviewStatus: "PENDING" } },
      canonicalDomain: { not: null },
      slug: { notIn: [GENERIC_SLUG, "multi-site"] },
      OR: [{ storeActors: { some: {} } }, { actors: { some: {} } }],
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  const run = await createRun("WEBSITE_LOGO_ENRICHMENT", websites.length);
  const result: WebsiteCatalogResult = {
    expectedCount: websites.length,
    processedCount: 0,
    matchedCount: 0,
    unresolvedCount: 0,
    failedCount: 0,
    retryCount: options.retryCount ?? 0,
  };
  try {
    await verifyWebsiteLogoStorage();
  } catch (error) {
    const message = `Website logo storage is unavailable: ${
      error instanceof Error ? error.message : String(error)
    }`;
    result.error = message;
    await saveRun(run.id, result, "FAILED", message);
    return result;
  }
  try {
    for (const website of websites) {
      try {
        const discovered = await discoverOfficialLogo(website.canonicalDomain!);
        const stored = await storeWebsiteLogo(website.id, discovered.bytes);
        const automaticallyTrusted = isAutomaticallyTrustedLogoSource(discovered.sourceKind);
        const logo = await db.websiteLogo.upsert({
          where: {
            websiteIdentityId_checksum: {
              websiteIdentityId: website.id,
              checksum: stored.checksum,
            },
          },
          create: {
            websiteIdentityId: website.id,
            ...stored,
            sourceUrl: discovered.finalUrl,
            sourceDomain: website.canonicalDomain,
            sourceKind: discovered.sourceKind,
            reviewStatus: automaticallyTrusted ? "APPROVED" : "PENDING",
            reviewedAt: automaticallyTrusted ? new Date() : null,
          },
          update: {},
        });
        if (automaticallyTrusted) {
          await activateTrustedLogo({ website, logoId: logo.id });
        } else {
          await db.websiteIdentity.update({
            where: { id: website.id },
            data: { status: "ACTIVE", logoError: null },
          });
        }
        result.matchedCount += 1;
      } catch (error) {
        result.failedCount += 1;
        result.unresolvedCount += 1;
        await db.websiteIdentity.update({
          where: { id: website.id },
          data: {
            status: "LOGO_FAILED",
            logoError: (error instanceof Error ? error.message : String(error)).slice(0, 65_535),
          },
        });
      }
      result.processedCount += 1;
      await saveRun(run.id, result);
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await saveRun(run.id, result, result.failedCount ? "PARTIAL" : "COMPLETED");
    return result;
  } catch (error) {
    await saveRun(run.id, result, "FAILED", error instanceof Error ? error.message : String(error));
    throw error;
  }
}
