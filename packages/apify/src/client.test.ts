import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actorGet = vi.fn();
const actorUpdate = vi.fn();
const userGet = vi.fn();
const actorsList = vi.fn();
const storeList = vi.fn();
const { socketIo, publication } = vi.hoisted(() => ({
  socketIo: vi.fn(),
  publication: { response: null as unknown },
}));

vi.mock("apify-client", () => ({
  ApifyClient: class MockApifyClient {
    token?: string;
    baseUrl = "https://api.apify.com/v2";

    constructor(options: { token?: string }) {
      this.token = options.token;
    }

    actor() {
      return {
        get: actorGet,
        update: actorUpdate,
        versions: () => ({ create: vi.fn() }),
        runs: () => ({ list: vi.fn() }),
        start: vi.fn(),
      };
    }

    user() {
      return { get: userGet };
    }

    actors() {
      return { list: actorsList };
    }

    store() {
      return { list: storeList };
    }
  },
}));

vi.mock("socket.io-client", () => ({ io: socketIo }));

import { createApifyClient } from "./client.js";
import { analyzeActorPublishReadiness } from "@actorconsole/shared";

function actor(overrides: Record<string, unknown> = {}) {
  return {
    id: "actor-1",
    username: "owner",
    name: "actor",
    title: "Current title",
    description: "Current description",
    pictureUrl: "https://images.apify.com/current.png",
    categories: ["AUTOMATION"],
    pricingInfos: [],
    isPublic: true,
    taggedBuilds: { latest: { buildId: "build-1", buildNumber: "1.0.0" } },
    ...overrides,
  };
}

describe("ApifyClientWrapper marketplace publishing", () => {
  beforeEach(() => {
    actorGet.mockReset();
    actorUpdate.mockReset();
    userGet.mockReset();
    actorsList.mockReset();
    storeList.mockReset();
    socketIo.mockReset();
    publication.response = {
      status: "OK",
      id: "subscription-1",
      data: [],
    };
    socketIo.mockImplementation(() => {
      const onceListeners = new Map<string, (...args: unknown[]) => void>();
      const listeners = new Map<string, (...args: any[]) => void>();
      const socket = {
        once: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
          onceListeners.set(event, listener);
          if (event === "connect") queueMicrotask(listener);
          return socket;
        }),
        on: vi.fn((event: string, listener: (...args: any[]) => void) => {
          listeners.set(event, listener);
          return socket;
        }),
        emit: vi.fn((event: string, _payload: unknown, acknowledge?: (value: unknown) => void) => {
          if (event === "subscribe") queueMicrotask(() => acknowledge?.(publication.response));
          return socket;
        }),
        removeAllListeners: vi.fn(() => socket),
        disconnect: vi.fn(() => socket),
        __listeners: listeners,
        __onceListeners: onceListeners,
      };
      return socket;
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reads publication artifacts from the default build when Actor metadata omits them", async () => {
    actorGet.mockResolvedValueOnce(actor());
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            actorDefinition: {
              readme: "# Actor README",
              input: { type: "object", properties: {} },
              output: { type: "object", properties: {} },
              storages: { keyValueStore: { schemaVersion: 1 } },
            },
          },
        }),
      ),
    );
    const client = createApifyClient({ token: "api-token" });
    const live = await client.getActor("owner/actor");
    const artifacts = await client.getActorDefaultBuildArtifacts("owner/actor");
    expect(live?.readme).toBeNull();
    expect(live?.inputSchema).toBeUndefined();
    expect(artifacts).toMatchObject({
      readme: "# Actor README",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      keyValueStoreSchema: { schemaVersion: 1 },
    });
    expect(analyzeActorPublishReadiness({ ...live, ...artifacts }).publishReady).toBe(true);
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe(
      "https://api.apify.com/v2/actors/owner~actor/builds/default",
    );
  });

  it("supports legacy build README and JSON input schema without treating dataset schema as output", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            readme: "# Legacy Actor",
            inputSchema: JSON.stringify({ type: "object" }),
            actorDefinition: { storages: { dataset: { type: "object" } } },
          },
        }),
      ),
    );
    await expect(
      createApifyClient({ token: "api-token" }).getActorDefaultBuildArtifacts("actor-1"),
    ).resolves.toEqual({
      readme: "# Legacy Actor",
      inputSchema: { type: "object" },
      outputSchema: null,
      keyValueStoreSchema: null,
    });
  });

  it("rejects malformed schemas instead of accepting file paths or JSON arrays", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { actorDefinition: { input: "./INPUT_SCHEMA.json", output: "[]" } },
        }),
      ),
    );
    const artifacts = await createApifyClient({ token: "api-token" }).getActorDefaultBuildArtifacts(
      "actor-1",
    );
    expect(artifacts.inputSchema).toBeNull();
    expect(artifacts.outputSchema).toBeNull();
  });

  it("distinguishes a missing default build from a failed artifact read", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 404 }));
    const client = createApifyClient({ token: "api-token", maxRetries: 0 });
    await expect(client.getActorDefaultBuildArtifacts("actor-1")).resolves.toEqual({
      readme: null,
      inputSchema: null,
      outputSchema: null,
      keyValueStoreSchema: null,
    });
    vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 403 }));
    await expect(client.getActorDefaultBuildArtifacts("actor-1")).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("preserves marketplace fields and verifies a metadata update", async () => {
    actorGet.mockResolvedValueOnce(
      actor({
        categories: ["AUTOMATION"],
        seoTitle: "Existing SEO title",
        seoDescription: "Existing SEO description",
      }),
    );
    actorGet.mockResolvedValueOnce(
      actor({
        title: "New title",
        description: "New description",
        categories: ["AUTOMATION", "AI"],
        seoTitle: "Existing SEO title",
        seoDescription: "Existing SEO description",
      }),
    );
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }));

    const result = await createApifyClient({ token: "api-token" }).updateActorMetadata("actor-1", {
      title: "New title",
      description: "New description",
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      title: "New title",
      description: "New description",
      seoTitle: "Existing SEO title",
      seoDescription: "Existing SEO description",
    });
    expect(body).not.toHaveProperty("categories");
    expect((request.headers as Headers).get("x-apify-request-origin")).toBe("WEB");
    expect(result.verified).toBe(true);
    expect(result.actor.title).toBe("New title");
  });

  it("maps the display name from the nested users/me profile", async () => {
    userGet.mockResolvedValueOnce({
      id: "apify-account",
      username: "search-team",
      profile: {
        name: "Search Team",
        bio: "Actor builders",
        pictureUrl: "https://images.apify.com/profile.png",
      },
    });

    await expect(createApifyClient({ token: "api-token" }).getMe()).resolves.toMatchObject({
      id: "apify-account",
      username: "search-team",
      name: "Search Team",
      bio: "Actor builders",
      pictureUrl: "https://images.apify.com/profile.png",
    });
  });

  it("publishes with the same visibility-only payload as Apify Console", async () => {
    actorUpdate.mockResolvedValueOnce(
      actor({
        title: "Amazon Keyword Discovery Scraper",
        categories: ["ECOMMERCE", "SEO_TOOLS"],
        isPublic: true,
      }),
    );

    const result = await createApifyClient({ token: "api-token" }).publishActor("actor-1");

    expect(actorUpdate).toHaveBeenCalledWith({ isPublic: true });
    expect(result).toMatchObject({
      isPublic: true,
      categories: ["ECOMMERCE", "SEO_TOOLS"],
    });
  });

  it("validates API identity and Actor inventory access", async () => {
    userGet.mockResolvedValueOnce({ id: "apify-user", username: "builder" });
    actorsList.mockResolvedValueOnce({ items: [] });

    const me = await createApifyClient({ token: "api-token" }).validateApiAuthentication();

    expect(me).toMatchObject({ id: "apify-user", username: "builder" });
    expect(actorsList).toHaveBeenCalledWith({ my: true, limit: 1 });
  });

  it("rejects API validation when only a Console credential is configured", async () => {
    await expect(
      createApifyClient({ uiToken: "apify_ui_console-token-value" }).validateApiAuthentication(),
    ).rejects.toMatchObject({ code: "unauthorized", status: 401 });
    expect(userGet).not.toHaveBeenCalled();
  });

  it("preserves new Apify categories and grouped meta labels losslessly", async () => {
    actorGet.mockResolvedValueOnce(
      actor({
        categories: ["NEW_APIFY_CATEGORY"],
        metaLabels: [{ _id: "label-1", name: "Lead generation", type: "USE_CASE", value: "leads" }],
      }),
    );

    const result = await createApifyClient({ token: "api-token" }).getActor("actor-1");

    expect(result).toMatchObject({
      categories: ["NEW_APIFY_CATEGORY"],
      metaLabels: ["Lead generation"],
      metaLabelDetails: [
        { _id: "label-1", name: "Lead generation", type: "USE_CASE", value: "leads" },
      ],
    });
  });

  it("reports rejected API credentials at the request boundary", async () => {
    const onCredentialError = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "token expired" } }), { status: 401 }),
    );

    await expect(
      createApifyClient({ token: "expired-api-token", onCredentialError }).getApi("/v2/users/me"),
    ).rejects.toMatchObject({ code: "unauthorized", status: 401 });
    expect(onCredentialError).toHaveBeenCalledWith(
      "api",
      expect.objectContaining({ code: "unauthorized", status: 401 }),
      { authentication: false },
    );
  });

  it("reports cookie-to-UI-token authentication failures as Console credential failures", async () => {
    const onCredentialError = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "session expired" } }), { status: 401 }),
    );

    await expect(
      createApifyClient({ cookies: "ApifyRT=expired", onCredentialError }).getActorBasicInfo(
        "actor-1",
      ),
    ).rejects.toMatchObject({ code: "unauthorized", status: 401 });
    expect(onCredentialError).toHaveBeenCalledWith(
      "console",
      expect.objectContaining({ code: "unauthorized", status: 401 }),
      { authentication: true },
    );
  });

  it("uploads generated pictures through the Console flow before saving metadata", async () => {
    actorGet.mockResolvedValueOnce(actor());
    actorGet.mockResolvedValueOnce(actor({ pictureUrl: "https://images.apify.com/hosted.png" }));
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              title: "Current title",
              description: "Current description",
              categories: ["AUTOMATION"],
              pictureUrl: "old",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              uploadUrl: "https://upload.example/presigned",
              publicUrl: "https://images.apify.com/hosted.png",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              title: "Current title",
              description: "Current description",
              categories: ["AUTOMATION"],
              pictureUrl: "https://images.apify.com/hosted.png",
            },
          }),
          { status: 200 },
        ),
      );

    const result = await createApifyClient({
      token: "api-token",
      uiToken: "apify_ui_console-token-value",
    }).updateActorMetadata("actor-1", {
      picture: { fileName: "actor.png", contentType: "image/png", body: new Uint8Array([1, 2, 3]) },
    });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://console-backend.apify.com/actor/actor-1/basic-info",
      "https://console-backend.apify.com/upload/actor-picture/actor-1",
      "https://upload.example/presigned",
      "https://api.apify.com/v2/actors/actor-1",
      "https://console-backend.apify.com/actor/actor-1/basic-info",
    ]);
    expect(result.usedHostedPicture).toBe(true);
    expect(result.pictureUrl).toBe("https://images.apify.com/hosted.png");
  });

  it("uses Apify cookies for Console requests when no UI token is provided", async () => {
    actorGet.mockResolvedValueOnce(actor());
    actorGet.mockResolvedValueOnce(actor());
    const fetchMock = vi.mocked(fetch);
    const basicInfo = {
      data: {
        title: "Current title",
        description: "Current description",
        categories: ["AUTOMATION"],
        pictureUrl: "https://images.apify.com/current.png",
      },
    };
    const onConsoleCookieRefresh = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            userId: "apify-user",
            uiToken: "resumed-ui-token",
            hasElevatedPermissions: false,
            isAdmin: false,
          }),
          {
            status: 200,
            headers: { "set-cookie": "ApifyRT=rotated-session-value; Path=/; HttpOnly; Secure" },
          },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(basicInfo), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(basicInfo), { status: 200 }));

    await createApifyClient({
      token: "api-token",
      cookies: "Cookie: ApifyRT=session-value; ApifyProdUserId=user-value",
      consoleViewedUserId: "organization-id",
      onConsoleCookieRefresh,
    }).updateActorMetadata("actor-1", {});

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/public/authentication/resume");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      viewedUserId: "organization-id",
      forceAdminToken: false,
    });
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect((request.headers as Headers).get("authorization")).toBe("Bearer resumed-ui-token");
    expect((request.headers as Headers).get("cookie")).toBe("ApifyRT=rotated-session-value");
    expect(onConsoleCookieRefresh).toHaveBeenCalledWith("ApifyRT=rotated-session-value");
  });

  it("validates Console authentication without reading a probe Actor", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [],
          totalResults: 0,
          usedIndex: "recombee",
        }),
        { status: 200 },
      ),
    );

    await expect(
      createApifyClient({
        uiToken: "apify_ui_console-token-value",
      }).validateConsoleAuthentication(),
    ).resolves.toBe(true);

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "https://console-backend.apify.com/public/store/search?",
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("searchIndex=recombee");
    expect(actorGet).not.toHaveBeenCalled();
  });

  it("rejects analytics-only cookie exports before contacting Apify", () => {
    expect(() => createApifyClient({ cookies: "_ga=analytics; ApifyUtk=tracking-value" })).toThrow(
      /ApifyRT cookie is missing/,
    );
  });

  it("uses Console Store search and maps demand and review signals", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          totalResults: 57_725,
          usedIndex: "algolia",
          items: [
            {
              id: "store-actor",
              username: "builder",
              name: "maps",
              title: "Maps Actor",
              actorReviewCount: 12,
              actorReviewRating: 4.8,
              pictureUrl: "https://images.apify.test/maps.webp",
              stats: { totalUsers: 920 },
            },
            {
              id: "ignored-extra-actor",
              username: "builder",
              name: "extra",
              stats: { totalUsers: 100 },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const page = await createApifyClient({
      uiToken: "apify_ui_console-token-value",
    }).searchStorePage({
      q: "maps",
      limit: 1,
      offset: 24,
      sortBy: "relevance",
      searchIndex: "algolia",
    });
    const items = page.items;

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/public/store/search?");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("offset=24");
    expect(
      ((fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Headers).get("x-idempotency-key"),
    ).toBeTruthy();
    expect(items).toHaveLength(1);
    expect(page).toMatchObject({
      totalResults: 57_725,
      usedIndex: "algolia",
      recommId: null,
      queryId: null,
      facets: [],
      offset: 24,
      limit: 1,
    });
    expect(items[0]).toMatchObject({
      id: "store-actor",
      totalUsers: 920,
      reviewCount: 12,
      reviewRating: 4.8,
      stats: { totalUsers: 920, rating: 4.8, actorReviewCount: 12 },
    });
  });

  it("supports category refinements, recommendation cursors, and Store facets", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [],
            totalResults: 0,
            recommId: "next-recommendation",
            queryID: "query-1",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ facets: [{ categoryId: "AI", count: 42 }] }), {
          status: 200,
        }),
      );

    const page = await createApifyClient({
      uiToken: "apify_ui_console-token-value",
    }).searchStorePage({
      q: "agents",
      category: ["AI"],
      categoryRefinements: ["AGENTS"],
      recommId: "previous-recommendation",
      includeFacets: true,
      analyticsTags: ["console", "store-search"],
      clickAnalytics: true,
    });

    const searchUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(searchUrl.searchParams.getAll("category")).toEqual(["AI", "AGENTS"]);
    expect(searchUrl.searchParams.get("recommId")).toBe("previous-recommendation");
    expect(searchUrl.searchParams.has("offset")).toBe(false);
    expect(searchUrl.searchParams.get("filterByMetaLabels")).toBe("true");
    expect(searchUrl.searchParams.getAll("analyticsTags")).toEqual(["console", "store-search"]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/public/store/facets?");
    expect(page).toMatchObject({
      recommId: "next-recommendation",
      queryId: "query-1",
      facets: [{ categoryId: "AI", count: 42 }],
    });
  });

  it("submits category feedback without updating Actor categories", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(
      createApifyClient({
        uiToken: "apify_ui_console-token-value",
      }).submitActorCategoriesFeedback("actor-1", "Please classify this as an AI tool."),
    ).resolves.toEqual({ submitted: true });

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/actor/actor-1/categories-feedback");
    expect(request?.method).toBe("POST");
    expect(JSON.parse(String(request?.body))).toEqual({
      details: "Please classify this as an AI tool.",
    });
    expect(actorUpdate).not.toHaveBeenCalled();
  });

  it("reports publication preflight gates from available account metadata", async () => {
    actorGet
      .mockResolvedValueOnce(actor({ taggedBuilds: {} }))
      .mockResolvedValueOnce(actor({ taggedBuilds: {} }));
    userGet.mockResolvedValueOnce({
      id: "user-1",
      username: "owner",
      profile: { name: "Owner", isProfilePublic: false },
      primaryEmailVerified: false,
      primaryEmailDisposable: true,
    });

    const result = await createApifyClient({ token: "api-token" }).getActorPublicationPreflight(
      "actor-1",
    );

    expect(result).toEqual({
      actorId: "actor-1",
      checks: {
        taggedBuild: false,
        publicProfile: false,
        verifiedEmail: false,
        nonDisposableEmail: false,
      },
      blocking: [
        "MISSING_TAGGED_BUILD",
        "PUBLIC_PROFILE_REQUIRED",
        "EMAIL_NOT_VERIFIED",
        "DISPOSABLE_EMAIL",
      ],
      unknown: [],
    });
  });

  it("normalizes Console basic-info and loads all documented analytics surfaces", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            _id: "actor-1",
            username: "builder",
            name: "maps",
            stats: {
              totalUsers: 1000,
              totalUsers30Days: 240,
              actorReviewRating: 4.7,
              publicActorRunStats30Days: { TOTAL: 50, SUCCEEDED: 45 },
            },
            pricingInfos: [{ pricingModel: "PAY_PER_EVENT" }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ actors: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ values: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ dailyStats: { "2026-08-01": { TOTAL: 3, RESULTS: 10 } } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ values: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ values: [] }), { status: 200 }));

    const client = createApifyClient({ uiToken: "apify_ui_console-token-value" });
    const info = await client.getActorBasicInfo("actor-1");
    const analytics = await client.getActorAnalytics(["actor-1"], "2026-08-01");

    expect(info).toMatchObject({
      id: "actor-1",
      stats: { monthlyUsers: 240, rating: 4.7, publicActorRunStats30Days: { TOTAL: 50 } },
    });
    expect(analytics.runStatistics.dailyStats["2026-08-01"]).toMatchObject({
      TOTAL: 3,
      RESULTS: 10,
    });
    expect(analytics.availability).toEqual({
      actorBreakdown: true,
      costsPerThousandResults: true,
      runStatistics: true,
      userCountStatistics: true,
      profitMargin: true,
    });
    expect(analytics.errors).toEqual({});
    expect(fetchMock.mock.calls.slice(1).map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("actor-analytics/actor-breakdown"),
        expect.stringContaining("actor-analytics/costs-per-thousand-results"),
        expect.stringContaining("actor-analytics/run-statistics/monthly/all-users"),
        expect.stringContaining("actor-analytics/user-count-statistics"),
        expect.stringContaining("actor-analytics/profit-margin"),
      ]),
    );
  });

  it("loads and normalizes public Actor text reviews through Console authentication", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            items: [
              {
                _id: "review-1",
                rating: 5,
                textReview: "Clear output and reliable transcripts.",
                createdAt: "2026-08-14T12:00:00.000Z",
                author: { name: "Alice", username: "alice" },
                reply: {
                  text: "Thank you!",
                  createdAt: "2026-08-14T14:00:00.000Z",
                },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    const reviews = await createApifyClient({
      uiToken: "apify_ui_console-token-value",
    }).getActorTextReviews("actor-1");

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/actor/actor-1/text-reviews?limit=20");
    expect(reviews).toEqual([
      {
        id: "review-1",
        rating: 5,
        text: "Clear output and reliable transcripts.",
        createdAt: "2026-08-14T12:00:00.000Z",
        authorName: "Alice",
        authorUsername: "alice",
        developerReply: "Thank you!",
        developerReplyAt: "2026-08-14T14:00:00.000Z",
      },
    ]);
  });

  it("marks partially permitted owner analytics without discarding successful surfaces", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ actors: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ dailyStats: { "2026-08-01": { TOTAL: 4, SUCCEEDED: 3 } } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ values: [] }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ dailyProfitMarginStats: {} }), { status: 200 }),
      );

    const analytics = await createApifyClient({
      uiToken: "apify_ui_console-token-value",
    }).getActorAnalytics(["actor-1"], "2026-08-01");

    expect(analytics.runStatistics.dailyStats["2026-08-01"]?.TOTAL).toBe(4);
    expect(analytics.availability.costsPerThousandResults).toBe(false);
    expect(analytics.errors.costsPerThousandResults).toContain("Forbidden");
  });

  it("loads monetization in Console-sized batches without unrelated analytics requests", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          monetizationPerActor: [
            {
              actor: { _id: "actor-1" },
              earningsStats: { totalRevenueUsd: 4, totalCostUsd: 1, totalProfitUsd: 3 },
            },
          ],
          currentMonthProfitUsd: 3,
        }),
        { status: 200 },
      ),
    );

    const result = await createApifyClient({
      uiToken: "apify_ui_console-token-value",
    }).getActorMonetization(["actor-1"], "2026-08-01");

    expect(result.currentMonthProfitUsd).toBe(3);
    expect(result.monetizationPerActor).toHaveLength(1);
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
      "actor-analytics/actor-breakdown",
    );
  });

  it("falls back to the owner API when Console basic-info is scoped to another organization", async () => {
    actorGet.mockResolvedValueOnce(
      actor({
        id: "pjudC6ZqHgtouDeeq",
        username: "owner",
        name: "baidu-baike-scraper",
        title: "Baidu Baike Scraper",
        isDeprecated: false,
        notice: "NONE",
      }),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "error",
          statusCode: 403,
          errorCode: "insufficient-permissions",
          errorMessage: "Insufficient permissions for the Actor",
        }),
        { status: 403 },
      ),
    );

    const info = await createApifyClient({
      token: "owner-api-token",
      uiToken: "apify_ui_other-organization",
    }).getActorBasicInfo("pjudC6ZqHgtouDeeq");

    expect(info).toMatchObject({
      id: "pjudC6ZqHgtouDeeq",
      name: "baidu-baike-scraper",
      title: "Baidu Baike Scraper",
      isPublic: true,
      isDeprecated: false,
      notice: "NONE",
    });
    expect(actorGet).toHaveBeenCalledOnce();
  });

  it("explains that an owning API key is required when Console cannot access the Actor", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "error",
          statusCode: 403,
          errorCode: "insufficient-permissions",
          errorMessage: "Insufficient permissions for the Actor",
        }),
        { status: 403 },
      ),
    );

    await expect(
      createApifyClient({ uiToken: "apify_ui_other-organization" }).getActorBasicInfo(
        "pjudC6ZqHgtouDeeq",
      ),
    ).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
      message: expect.stringContaining("owning Apify user or organization"),
    });
    expect(actorGet).not.toHaveBeenCalled();
  });

  it("reports an ownership mismatch when neither Console nor the API key can read the Actor", async () => {
    actorGet.mockRejectedValueOnce({
      statusCode: 403,
      type: "insufficient-permissions",
      message: "Insufficient permissions for the Actor",
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "error",
          statusCode: 403,
          errorCode: "insufficient-permissions",
          errorMessage: "Insufficient permissions for the Actor",
        }),
        { status: 403 },
      ),
    );

    await expect(
      createApifyClient({
        token: "wrong-owner-api-token",
        uiToken: "apify_ui_other-organization",
      }).getActorBasicInfo("pjudC6ZqHgtouDeeq"),
    ).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
      message: expect.stringContaining(
        "Console UI tokens and cookies do not grant Actor write access",
      ),
    });
  });

  it("completes a metadata update when Console and API credentials target different organizations", async () => {
    const currentActor = actor({
      id: "pjudC6ZqHgtouDeeq",
      username: "owner",
      name: "baidu-baike-scraper",
      title: "Baidu Baike Scraper",
    });
    const updatedActor = actor({
      ...currentActor,
      title: "Baidu Baike Data Scraper",
      description: "Updated Store description",
    });
    actorGet
      .mockResolvedValueOnce(currentActor)
      .mockResolvedValueOnce(currentActor)
      .mockResolvedValueOnce(updatedActor)
      .mockResolvedValueOnce(updatedActor);
    const permissionError = () =>
      new Response(
        JSON.stringify({
          status: "error",
          statusCode: 403,
          errorCode: "insufficient-permissions",
          errorMessage: "Insufficient permissions for the Actor",
        }),
        { status: 403 },
      );
    vi.mocked(fetch)
      .mockResolvedValueOnce(permissionError())
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }))
      .mockResolvedValueOnce(permissionError());

    const result = await createApifyClient({
      token: "owner-api-token",
      uiToken: "apify_ui_other-organization",
    }).updateActorMetadata("pjudC6ZqHgtouDeeq", {
      title: "Baidu Baike Data Scraper",
      description: "Updated Store description",
    });

    expect(result).toMatchObject({
      verified: true,
      actor: {
        title: "Baidu Baike Data Scraper",
        description: "Updated Store description",
      },
    });
    expect(actorGet).toHaveBeenCalledTimes(4);
  });

  it("uses the owner API for basic info when no Console credential is configured", async () => {
    actorGet.mockResolvedValueOnce(actor({ title: "API-only Actor" }));

    const info = await createApifyClient({ token: "owner-api-token" }).getActorBasicInfo("actor-1");

    expect(info).toMatchObject({ id: "actor-1", title: "API-only Actor", isPublic: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("marks compact Actor list responses as lacking Store lifecycle status", async () => {
    actorsList.mockResolvedValueOnce({
      items: [
        {
          id: "actor-1",
          username: "owner",
          name: "compact-actor",
        },
      ],
    });

    const items = await createApifyClient({ token: "owner-api-token" }).listMyActors();

    expect(items[0]).toMatchObject({
      id: "actor-1",
      isPublic: true,
      storeStatusAvailable: false,
      storeVisibilityAvailable: false,
      storeDeprecationAvailable: false,
      storeNoticeAvailable: false,
    });
  });

  it("loads and normalizes the Apify Console notification publication", async () => {
    publication.response = {
      status: "OK",
      id: "notifications-subscription",
      data: [
        {
          _id: "notification-1",
          userId: "user-1",
          kind: "ACTOR_UNDER_MAINTENANCE",
          createdAt: "2026-08-12T08:00:00.000Z",
          subject: "Actor needs attention",
          body: "A quality check failed.",
          url: "/actors/runs/run-1",
          deliveryStatus: { ui: { displayedAt: "2026-08-12T08:01:00.000Z" } },
        },
        { invalid: true },
      ],
    };

    const notifications = await createApifyClient({
      uiToken: "apify_ui_valid_token_123",
    }).listConsoleNotifications();

    expect(notifications).toEqual([
      expect.objectContaining({
        _id: "notification-1",
        kind: "ACTOR_UNDER_MAINTENANCE",
        subject: "Actor needs attention",
        deliveryStatus: { ui: { displayedAt: "2026-08-12T08:01:00.000Z" } },
      }),
    ]);
    expect(socketIo).toHaveBeenCalledWith(
      "https://console-backend.apify.com",
      expect.objectContaining({ transports: ["websocket"], reconnection: false }),
    );
    const socket = socketIo.mock.results[0]?.value;
    expect(socket.emit).toHaveBeenCalledWith(
      "subscribe",
      expect.objectContaining({
        publicationName: "userUiNotificationsPub",
        uiToken: "apify_ui_valid_token_123",
        params: [],
      }),
      expect.any(Function),
    );
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it("uses the verified Console endpoints to mark notifications as read", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    const client = createApifyClient({ uiToken: "apify_ui_valid_token_123" });

    await client.markConsoleNotificationRead("notification/1");
    await client.markAllConsoleNotificationsRead();

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://console-backend.apify.com/user-notifications/mark-notification-as-read-in-ui/notification%2F1",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://console-backend.apify.com/user-notifications/mark-all-notifications-as-read-in-ui",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("loads API inventory totals independently across Actors, runs, and storage", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { total: 863, items: [] } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { total: 4200, items: [] } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { total: 180, items: [] } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { count: 170, items: [] } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { total: 92, items: [] } }), { status: 200 }),
      );

    const inventory = await createApifyClient({ token: "api-token" }).getResourceInventory();

    expect(inventory).toEqual({
      actors: 863,
      runs: 4200,
      datasets: 180,
      keyValueStores: 170,
      requestQueues: 92,
    });
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining("/v2/acts?"),
      expect.stringContaining("/v2/actor-runs?"),
      expect.stringContaining("/v2/datasets?"),
      expect.stringContaining("/v2/key-value-stores?"),
      expect.stringContaining("/v2/request-queues?"),
    ]);
  });

  it("normalizes Console organizations and proxy usage cycles", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                _id: "organization-1",
                name: "SearchAPI",
                isOwner: true,
                rolePermissions: ["ACTOR_READ", "ACTOR_WRITE"],
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                startAt: "2026-08-01T00:00:00.000Z",
                endAt: "2026-09-01T00:00:00.000Z",
              },
            ],
          }),
          { status: 200 },
        ),
      );
    const client = createApifyClient({ uiToken: "apify_ui_console-token-value" });

    await expect(client.listConsoleOrganizations()).resolves.toEqual([
      {
        id: "organization-1",
        name: "SearchAPI",
        isOwner: true,
        rolePermissions: ["ACTOR_READ", "ACTOR_WRITE"],
      },
    ]);
    await expect(client.listProxyUsageCycles()).resolves.toEqual([
      {
        startAt: "2026-08-01T00:00:00.000Z",
        endAt: "2026-09-01T00:00:00.000Z",
      },
    ]);
  });

  it("loads actor chart metrics without depending on pricing analytics", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ dailyStats: { "2026-08-10": { TOTAL: 9, RESULTS: 120 } } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ values: [{ date: "2026-08-10", activeUsers: 12 }] }), {
          status: 200,
        }),
      );

    const metrics = await createApifyClient({
      uiToken: "apify_ui_console-token-value",
    }).getActorMetricAnalytics(["actor-1"], "2026-08-01");

    expect(metrics).toMatchObject({
      month: "2026-08-01",
      runStatistics: { dailyStats: { "2026-08-10": { TOTAL: 9 } } },
      userCountStatistics: { values: [{ activeUsers: 12 }] },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("run-statistics/monthly/all-users"),
        expect.stringContaining("user-count-statistics"),
      ]),
    );
  });

  it("loads and normalizes Actor acquisition analytics", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          numUniqueViewingUsers: 42,
          numUniqueConsolePageViews: 88,
          numUniqueUsersWithRun: 12,
          topReferrers: [{ origin: "google.com", trafficPercent: 55 }],
          topCountryCodes: [{ origin: "US", trafficPercent: 40 }],
        }),
        { status: 200 },
      ),
    );
    const acquisition = await createApifyClient({
      uiToken: "apify_ui_console-token-value",
    }).getActorAcquisition(["actor-1"], "2026-08-01", 0.5);

    expect(acquisition).toMatchObject({
      numUniqueViewingUsers: 42,
      numUniqueConsolePageViews: 88,
      numUniqueUsersWithRun: 12,
    });
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
      "actor-analytics/monthly-marketing",
    );
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain("portionOfMonthElapsed=0.5");
  });

  it("keeps run charts available when user-count analytics are unavailable", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ dailyStats: { "2026-08-10": { TOTAL: 9 } } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Not available" }), { status: 403 }),
      );

    const metrics = await createApifyClient({
      uiToken: "apify_ui_console-token-value",
    }).getActorMetricAnalytics(["actor-1"], "2026-08-01");

    expect(metrics.runStatistics?.dailyStats["2026-08-10"]?.TOTAL).toBe(9);
    expect(metrics.userCountStatistics).toBeNull();
  });

  it("loads actor quality and tolerates a missing feedback surface", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            hasInputSchema: 1,
            hasOutputSchema: 1,
            hasReadme: 1,
            actorQuality: 0.86,
            actorQualityPercentile: 0.91,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Unavailable" }), { status: 403 }),
      );

    const quality = await createApifyClient({
      uiToken: "apify_ui_console-token-value",
    }).getActorQuality("actor-1");

    expect(quality).toMatchObject({
      scores: { actorQuality: 0.86, actorQualityPercentile: 0.91 },
      praises: [],
      improvements: [],
    });
  });

  it("summarizes consented shared runs without exposing run or user identifiers", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          total: 3,
          items: [
            {
              id: "private-run-id",
              userId: "private-user-id",
              status: "SUCCEEDED",
              finishedAt: "2026-08-12T10:00:00.000Z",
            },
            {
              run: {
                id: "another-private-id",
                status: "FAILED",
                finishedAt: "2026-08-11T10:00:00.000Z",
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const summary = await createApifyClient({
      uiToken: "apify_ui_console-token-value",
    }).getActorSharedRunSummary(["actor-1"]);

    expect(summary).toEqual({
      total: 3,
      sampled: 2,
      retentionDays: 7,
      latestFinishedAt: "2026-08-12T10:00:00.000Z",
      statuses: { SUCCEEDED: 1, FAILED: 1 },
      dailyRuns: { "2026-08-12": 1, "2026-08-11": 1 },
    });
    expect(JSON.stringify(summary)).not.toContain("private-run-id");
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain("shared-runs");
  });

  it("loads the documented account billing surfaces", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            "2026-08": {
              monthStartAt: "2026-08-01T00:00:00.000Z",
              monthEndAt: "2026-09-01T00:00:00.000Z",
              serviceUsages: {
                ACTOR_COMPUTE_UNITS: { quantity: 2, baseAmountUsd: 1.5, baseUnitPriceUsd: 0.75 },
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              actorId: "actor-1",
              name: "maps",
              username: "builder",
              title: "Maps",
              pictureUrl: null,
              totalUsageUsd: 4.2,
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ dailyServiceUsage: {}, monthlyServiceUsage: {} }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ACTOR_COMPUTE_UNITS: [
              {
                serviceKey: "ACTOR_COMPUTE_UNITS",
                quantity: 2,
                baseAmountUsd: 1.5,
                baseUnitPriceUsd: 0.75,
              },
            ],
          }),
          { status: 200 },
        ),
      );
    const client = createApifyClient({ uiToken: "apify_ui_console-token-value" });
    const [monthly, actors, calendar, services] = await Promise.all([
      client.getMonthlyUsages("2026-08-01T00:00:00.000Z", "2026-08-12T00:00:00.000Z"),
      client.getActorUsageBreakdown("2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"),
      client.getCalendarMonthUsage("2026-08-01T00:00:00.000Z"),
      client.getCurrentBillingCycleServiceBreakdown(),
    ]);
    expect(monthly["2026-08"]?.serviceUsages.ACTOR_COMPUTE_UNITS?.baseAmountUsd).toBe(1.5);
    expect(actors[0]?.totalUsageUsd).toBe(4.2);
    expect(calendar.dailyServiceUsage).toEqual({});
    expect(services.ACTOR_COMPUTE_UNITS?.[0]?.quantity).toBe(2);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/users/monthly-usages?"),
        expect.stringContaining("/billing/actor-usage-breakdown?"),
        expect.stringContaining("/users/calendar-month-usage-info?"),
        expect.stringContaining("/users/current-billing-cycle/service-breakdown"),
      ]),
    );
  });

  it("loads current usage and limits from the token-authenticated public API", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              usageCycle: {
                startAt: "2026-08-01T00:00:00.000Z",
                endAt: "2026-09-01T00:00:00.000Z",
              },
              monthlyServiceUsage: {},
              dailyServiceUsages: [],
              totalUsageCreditsUsdBeforeVolumeDiscount: 12,
              totalUsageCreditsUsdAfterVolumeDiscount: 10,
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              monthlyUsageCycle: {
                startAt: "2026-08-01T00:00:00.000Z",
                endAt: "2026-09-01T00:00:00.000Z",
              },
              limits: { maxMonthlyUsageUsd: 100 },
              current: { monthlyUsageUsd: 10 },
            },
          }),
          { status: 200 },
        ),
      );

    const client = createApifyClient({ token: "api-token" });
    const [usage, limits] = await Promise.all([
      client.getAccountMonthlyUsage("2026-08-12"),
      client.getAccountLimits(),
    ]);

    expect(usage.totalUsageCreditsUsdAfterVolumeDiscount).toBe(10);
    expect(limits.limits.maxMonthlyUsageUsd).toBe(100);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/v2/users/me/usage/monthly?date=2026-08-12"),
        expect.stringContaining("/v2/users/me/limits"),
      ]),
    );
  });

  it("uses the complete public Store search surface and preserves usage statistics", async () => {
    storeList.mockResolvedValueOnce({
      total: 57_743,
      items: [
        {
          id: "public-actor",
          username: "builder",
          name: "maps",
          createdAt: "2026-07-01T00:00:00.000Z",
          modifiedAt: "2026-08-01T00:00:00.000Z",
          firstPublishedAt: "2026-07-02T00:00:00.000Z",
          stats: {
            totalUsers: 1_000,
            totalUsers30Days: 240,
            publicActorRunStats30Days: { TOTAL: 500 },
          },
          currentPricingInfo: { pricingModel: "PAY_PER_EVENT" },
        },
      ],
    });

    const page = await createApifyClient({
      uiToken: "apify_ui_console-token-value",
    }).searchStorePage({
      q: "",
      limit: 1_000,
      category: "AI",
      pricingModel: "PAY_PER_EVENT",
      sortBy: "lastUpdate",
      searchBackend: "public",
      includeUnrunnableActors: true,
    });

    expect(storeList).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 1_000,
        category: "AI",
        pricingModel: "PAY_PER_EVENT",
        sortBy: "lastUpdate",
        includeUnrunnableActors: true,
      }),
    );
    expect(page).toMatchObject({ totalResults: 57_743, usedIndex: "public-api" });
    expect(page.items[0]).toMatchObject({
      stats: {
        totalUsers30Days: 240,
        publicActorRunStats30Days: { TOTAL: 500 },
      },
      pricingInfos: [{ pricingModel: "PAY_PER_EVENT" }],
      createdAt: "2026-07-01T00:00:00.000Z",
      modifiedAt: "2026-08-01T00:00:00.000Z",
      firstPublishedAt: "2026-07-02T00:00:00.000Z",
    });
  });

  it("uses API-token auth for private run analytics", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            items: [
              {
                id: "run-1",
                actId: "actor-1",
                status: "SUCCEEDED",
                startedAt: "2026-08-01T10:00:00.000Z",
                defaultDatasetId: "dataset-1",
                usageTotalUsd: 0.12,
                meta: { origin: "SCHEDULER" },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    const runs = await createApifyClient({
      token: "api-token",
      uiToken: "apify_ui_console-token-value",
    }).listActorRuns("actor-1", {
      limit: 100,
      offset: 200,
      startedAfter: "2026-08-01T00:00:00.000Z",
      desc: true,
    });

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/v2/actors/actor-1/runs");
    expect(String(url)).toContain("startedAfter=2026-08-01T00%3A00%3A00.000Z");
    expect(String(url)).toContain("offset=200");
    expect((request?.headers as Headers).get("authorization")).toBe("Bearer api-token");
    expect(runs[0]).toMatchObject({
      id: "run-1",
      usageTotalUsd: 0.12,
      origin: "SCHEDULER",
    });
  });

  it("appends a future pricing period without deleting existing periods", async () => {
    const existing = {
      pricingModel: "PAY_PER_EVENT" as const,
      startedAt: "2025-01-01T00:00:00.000Z",
      pricingPerEvent: {
        actorChargeEvents: {
          scrape: { eventPriceUsd: 0.01, eventTitle: "Old scrape" },
        },
      },
    };
    const next = {
      pricingModel: "PAY_PER_EVENT" as const,
      pricingPerEvent: {
        actorChargeEvents: {
          scrape: { eventPriceUsd: 0.02, eventTitle: "Scrape" },
        },
      },
    };
    actorGet.mockResolvedValueOnce(actor({ pricingInfos: [existing] }));
    actorGet.mockResolvedValueOnce(
      actor({ pricingInfos: [existing, { ...next, startedAt: "2030-01-01T00:00:00.000Z" }] }),
    );
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }));

    const result = await createApifyClient({ token: "api-token" }).appendActorPricing(
      "actor-1",
      next,
      {
        startedAt: "2030-01-01T00:00:00.000Z",
      },
    );

    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as {
      pricingInfos: unknown[];
    };
    expect(body.pricingInfos).toHaveLength(2);
    expect(result.changed).toBe(true);
    expect(result.pricingInfos).toHaveLength(2);
  });

  it("allows returning to a pricing definition that was superseded by a newer period", async () => {
    const original = {
      pricingModel: "PAY_PER_EVENT" as const,
      startedAt: "2025-01-01T00:00:00.000Z",
      pricingPerEvent: {
        actorChargeEvents: {
          scrape: { eventPriceUsd: 0.01, eventTitle: "Scrape" },
        },
      },
    };
    const current = {
      pricingModel: "PAY_PER_EVENT" as const,
      startedAt: "2026-01-01T00:00:00.000Z",
      pricingPerEvent: {
        actorChargeEvents: {
          scrape: { eventPriceUsd: 0.02, eventTitle: "Scrape" },
        },
      },
    };
    const requested = {
      pricingModel: "PAY_PER_EVENT" as const,
      pricingPerEvent: original.pricingPerEvent,
    };
    const nextStartedAt = "2030-01-01T00:00:00.000Z";

    actorGet.mockResolvedValueOnce(actor({ pricingInfos: [original, current] }));
    actorGet.mockResolvedValueOnce(
      actor({ pricingInfos: [original, current, { ...requested, startedAt: nextStartedAt }] }),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: {} }), { status: 200 }),
    );

    const result = await createApifyClient({ token: "api-token" }).appendActorPricing(
      "actor-1",
      requested,
      { startedAt: nextStartedAt },
    );

    expect(result.changed).toBe(true);
    expect(
      JSON.parse(String((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body)),
    ).toMatchObject({
      pricingInfos: [original, current, { ...requested, startedAt: nextStartedAt }],
    });
  });

  it("rejects pricing changes scheduled in the past", async () => {
    actorGet.mockResolvedValueOnce(actor());
    await expect(
      createApifyClient({ token: "api-token" }).appendActorPricing(
        "actor-1",
        {
          pricingModel: "PAY_PER_EVENT",
          pricingPerEvent: {
            actorChargeEvents: { run: { eventPriceUsd: 0.01, eventTitle: "Run" } },
          },
        },
        { startedAt: "2020-01-01T00:00:00.000Z" },
      ),
    ).rejects.toMatchObject({ code: "validation", status: 422 });
  });

  it("updates and verifies Actor Store lifecycle flags", async () => {
    actorGet.mockResolvedValueOnce(actor({ isPublic: true, isDeprecated: false, notice: "NONE" }));
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: {} }), { status: 200 }),
    );

    const result = await createApifyClient({ token: "api-token" }).updateActorStoreStatus(
      "actor-1",
      { underMaintenance: false, isDeprecated: false },
    );

    const [url, request] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toContain("/v2/actors/actor-1");
    expect(request?.method).toBe("PUT");
    expect(JSON.parse(String(request?.body))).toEqual({
      isDeprecated: false,
      notice: "NONE",
    });
    expect(result).toMatchObject({
      isPublic: true,
      isDeprecated: false,
      underMaintenance: false,
      notice: "NONE",
      verified: true,
    });
  });

  it("falls back to API verification when Console auth cannot access the Actor organization", async () => {
    actorGet.mockResolvedValueOnce(actor({ isPublic: true, isDeprecated: false, notice: "NONE" }));
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "error",
            errorCode: "insufficient-permissions",
            errorMessage: "Insufficient permissions for the Actor",
          }),
          { status: 403 },
        ),
      );

    const result = await createApifyClient({
      token: "api-token",
      uiToken: "apify_ui_console-token-value",
    }).updateActorStoreStatus("actor-1", { underMaintenance: false, isDeprecated: false });

    expect(result).toMatchObject({
      isPublic: true,
      isDeprecated: false,
      underMaintenance: false,
      notice: "NONE",
      verified: true,
    });
  });

  it("does not fail a lifecycle update when optional Console verification is expired", async () => {
    actorGet.mockResolvedValueOnce(actor({ isPublic: false, isDeprecated: false, notice: "NONE" }));
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "expired" }), { status: 401 }));

    const result = await createApifyClient({
      token: "owner-api-token",
      uiToken: "apify_ui_expired-token",
    }).updateActorStoreStatus("actor-1", { underMaintenance: false, isDeprecated: false });

    expect(result).toMatchObject({
      isPublic: false,
      isDeprecated: false,
      underMaintenance: false,
      notice: "NONE",
      verified: true,
    });
  });

  it("retries temporary Console rate limits before returning Actor data", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ errorMessage: "Too Many Requests" }), {
          status: 429,
          headers: { "retry-after": "2" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: actor({ title: "Retried Actor" }) }), { status: 200 }),
      );

    const request = createApifyClient({
      uiToken: "apify_ui_console-token-value",
      maxRetries: 1,
      minRetryDelayMs: 10,
      maxRetryDelayMs: 5_000,
      retryJitterRatio: 0,
    }).getActorBasicInfo("actor-1");

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(request).resolves.toMatchObject({ title: "Retried Actor" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns a stable rate-limit error after all transient retries are exhausted", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ errorMessage: "Too Many Requests" }), { status: 429 }),
    );

    await expect(
      createApifyClient({
        uiToken: "apify_ui_console-token-value",
        maxRetries: 2,
        minRetryDelayMs: 0,
        maxRetryDelayMs: 0,
        retryJitterRatio: 0,
      }).getActorBasicInfo("actor-1"),
    ).rejects.toMatchObject({ code: "rate_limited", status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not fail a successful lifecycle write when Console verification remains throttled", async () => {
    actorGet.mockResolvedValueOnce(actor({ isPublic: true, isDeprecated: false, notice: "NONE" }));
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ errorMessage: "Too Many Requests" }), { status: 429 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ errorMessage: "Too Many Requests" }), { status: 429 }),
      );

    const result = await createApifyClient({
      token: "owner-api-token",
      uiToken: "apify_ui_console-token-value",
      maxRetries: 1,
      minRetryDelayMs: 0,
      maxRetryDelayMs: 0,
      retryJitterRatio: 0,
    }).updateActorStoreStatus("actor-1", { underMaintenance: false, isDeprecated: false });

    expect(result).toMatchObject({
      isPublic: true,
      isDeprecated: false,
      underMaintenance: false,
      notice: "NONE",
      verified: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps the REST publication-limit response to the stable quota error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            type: "daily-publication-limit-exceeded",
            message: "The Actor publication limit for the last 24 hours was exceeded",
          },
        }),
        { status: 400 },
      ),
    );

    await expect(
      createApifyClient({ token: "api-token" }).updateActorStoreStatus("actor-1", {
        underMaintenance: false,
      }),
    ).rejects.toMatchObject({ code: "daily_publication_limit", status: 400 });
  });

  it("does not retry a 429 response that represents the daily publication quota", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          errorCode: "daily-publication-limit-exceeded",
          errorMessage: "The Actor publication limit for the last 24 hours was exceeded",
        }),
        { status: 429 },
      ),
    );

    await expect(
      createApifyClient({
        token: "api-token",
        maxRetries: 5,
        minRetryDelayMs: 0,
        maxRetryDelayMs: 0,
        retryJitterRatio: 0,
      }).updateActorStoreStatus("actor-1", { underMaintenance: false }),
    ).rejects.toMatchObject({ code: "daily_publication_limit", status: 429 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
