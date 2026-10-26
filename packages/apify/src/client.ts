/**
 * The only place in the codebase that imports `apify-client` directly. Every
 * other module goes through `ApifyClientWrapper` (returned by
 * `createApifyClient`) so we have a single, typed error-mapping boundary.
 *
 * 404s (actor not found, store item missing) resolve to `null` — they're not
 * exceptional for our use cases. Every other error becomes an
 * `ApifyClientError` with a stable `code` field.
 */

import { ApifyClient } from "apify-client";
import { io, type Socket } from "socket.io-client";
import { ApifyClientError, mapStatusToCode, toApifyClientError } from "./errors";
import { normalizeConsoleCookies, normalizeConsoleUiToken } from "./credentials";
import type {
  ApifyActorBasicInfo,
  ApifyActorBuildArtifacts,
  ApifyActorCategoryFeedbackResult,
  ApifyActorDetail,
  ApifyActorId,
  ApifyActorMetadataInput,
  ApifyActorMetadataResult,
  ApifyActorPublicationPreflight,
  ApifyActorStoreStatusInput,
  ApifyActorStoreStatusResult,
  ApifyPricingInfo,
  ApifyPricingUpdateResult,
  ApifyActorSummary,
  ApifyActorUpdateFields,
  ApifyRun,
  ApifyStoreSearchResult,
  ApifyStoreSearchOptions,
  ApifyStoreSearchPage,
  ApifyStoreFacet,
  ApifyConsoleSession,
  ApifyConsoleNotification,
  ApifyConsoleOrganization,
  ApifyProxyUsageCycle,
  ApifyResourceInventory,
  ApifyActorAnalytics,
  ApifyActorBreakdown,
  ApifyActorMetricAnalytics,
  ApifyActorTextReview,
  ApifyActorAcquisition,
  ApifyActorQuality,
  ApifyActorQualityFeedbackItem,
  ApifyActorQualityScores,
  ApifyActorSharedRunSummary,
  ApifyActorUsageBreakdownItem,
  ApifyCalendarMonthUsage,
  ApifyCurrentServiceBreakdown,
  ApifyAccountLimits,
  ApifyAccountMonthlyUsage,
  ApifyMonthlyUsages,
  ApifyActorRunStatistics,
  ApifyUserProfile,
  BillingDailyUsageItem,
} from "./types";

export interface CreateApifyClientOptions {
  token?: string;
  /** An Apify UI token used for Console publishing operations. */
  uiToken?: string;
  /** A raw Apify Console cookie header or JSON cookie export used as a UI-token fallback. */
  cookies?: string;
  /**
   * Apify user or organization selected in Console. Organization API tokens
   * must resume cookies in this context or owner analytics return 403.
   */
  consoleViewedUserId?: string;
  baseUrl?: string;
  maxRetries?: number;
  /** Initial delay used by REST, Console, and SDK retries. */
  minRetryDelayMs?: number;
  /** Upper bound for exponential backoff and server-provided retry delays. */
  maxRetryDelayMs?: number;
  /** Randomizes client-side backoff to avoid synchronized retry bursts. */
  retryJitterRatio?: number;
  /** Per-attempt network deadline for REST and Console requests. */
  requestTimeoutMs?: number;
  /** Receives authentication failures so callers can persist credential health. */
  onCredentialError?: (
    credential: "api" | "console",
    error: ApifyClientError,
    context: { authentication: boolean },
  ) => void | Promise<void>;
  /** Restores persisted health after a credential completes an authenticated request. */
  onCredentialValid?: (credential: "api" | "console") => void | Promise<void>;
  /** Persists a rotated ApifyRT cookie returned by Console authentication resume. */
  onConsoleCookieRefresh?: (cookies: string) => void | Promise<void>;
}

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_MIN_RETRY_DELAY_MS = 1_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 60_000;
const DEFAULT_RETRY_JITTER_RATIO = 0.2;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const CONSOLE_BACKEND_URL = "https://console-backend.apify.com";
const CONSOLE_PUBLICATION_TIMEOUT_MS = 7_500;
const PRESERVED_METADATA_FIELDS = [
  "isSourceCodeHidden",
  "isDeprecated",
  "isPublic",
  "notice",
  "customStatus",
  "seoTitle",
  "seoDescription",
] as const;

export class ApifyClientWrapper {
  private readonly raw: ApifyClient;
  private readonly apiToken?: string;
  private readonly uiToken?: string;
  private readonly consoleViewedUserId?: string;
  private cookies?: string;
  private readonly onCredentialError?: CreateApifyClientOptions["onCredentialError"];
  private readonly onCredentialValid?: CreateApifyClientOptions["onCredentialValid"];
  private readonly onConsoleCookieRefresh?: CreateApifyClientOptions["onConsoleCookieRefresh"];
  private readonly retryOptions: FetchRetryOptions;
  private resumedConsoleSession?: Promise<ApifyConsoleSession>;

  constructor(opts: CreateApifyClientOptions) {
    this.apiToken = opts.token;
    this.uiToken = opts.uiToken?.trim() ? normalizeConsoleUiToken(opts.uiToken) : undefined;
    this.cookies = opts.cookies?.trim() ? normalizeConsoleCookies(opts.cookies) : undefined;
    this.consoleViewedUserId = opts.consoleViewedUserId?.trim() || undefined;
    this.onCredentialError = opts.onCredentialError;
    this.onCredentialValid = opts.onCredentialValid;
    this.onConsoleCookieRefresh = opts.onConsoleCookieRefresh;
    const maxRetries = boundedInteger(opts.maxRetries, DEFAULT_MAX_RETRIES, 0, 10);
    const minDelayMs = boundedInteger(opts.minRetryDelayMs, DEFAULT_MIN_RETRY_DELAY_MS, 0, 60_000);
    this.retryOptions = {
      maxRetries,
      minDelayMs,
      maxDelayMs: boundedInteger(
        opts.maxRetryDelayMs,
        DEFAULT_MAX_RETRY_DELAY_MS,
        minDelayMs,
        120_000,
      ),
      jitterRatio: boundedNumber(opts.retryJitterRatio, DEFAULT_RETRY_JITTER_RATIO, 0, 1),
      requestTimeoutMs: boundedInteger(
        opts.requestTimeoutMs,
        DEFAULT_REQUEST_TIMEOUT_MS,
        1_000,
        60_000,
      ),
    };
    this.raw = new ApifyClient({
      token: opts.token,
      ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
      maxRetries,
      minDelayBetweenRetriesMillis: minDelayMs,
    });
  }

  // ---------- reads: 404 → null, others → throw ----------

  async getActor(idOrUsernameName: ApifyActorId): Promise<ApifyActorDetail | null> {
    return this.wrap(async () => {
      const a = await this.raw.actor(idOrUsernameName).get();
      return a ? toActorDetail(a) : null;
    });
  }

  /** The Actor metadata endpoint omits artifacts; publication validates the default build. */
  async getActorDefaultBuildArtifacts(
    idOrUsernameName: ApifyActorId,
  ): Promise<ApifyActorBuildArtifacts> {
    let build: Record<string, unknown>;
    try {
      const response = await this.getApi<{ data: Record<string, unknown> }>(
        `/v2/actors/${encodeURIComponent(idOrUsernameName.replace("/", "~"))}/builds/default`,
      );
      if (!isRecord(response.data)) {
        throw new ApifyClientError("unknown", "Apify returned no default build data");
      }
      build = response.data;
    } catch (error) {
      if (!(error instanceof ApifyClientError) || error.code !== "not_found") throw error;
      return { readme: null, inputSchema: null, outputSchema: null, keyValueStoreSchema: null };
    }
    const definition = isRecord(build.actorDefinition) ? build.actorDefinition : {};
    const storages = isRecord(definition.storages) ? definition.storages : {};
    const schema = (value: unknown): Record<string, unknown> | null => {
      const parsed = typeof value === "string" ? parseResponseBody(value) : value;
      return isRecord(parsed) && !Array.isArray(parsed) ? parsed : null;
    };
    return {
      readme:
        typeof definition.readme === "string"
          ? definition.readme
          : typeof build.readme === "string"
            ? build.readme
            : null,
      inputSchema: schema(definition.input ?? build.inputSchema),
      outputSchema: schema(definition.output ?? build.outputSchema),
      keyValueStoreSchema: schema(storages.keyValueStore),
    };
  }

  async getMe(): Promise<ApifyUserProfile | null> {
    return this.wrap(async () => {
      const u = await this.raw.user("me").get();
      return u ? toUserProfile(u) : null;
    });
  }

  /** Whether this client has a credential for the stable Apify API. */
  hasApiToken(): boolean {
    return Boolean(this.apiToken);
  }

  /**
   * Validate the API credential at the capability boundary used by Actor
   * inventory and publishing. `getMe()` alone can succeed for a restricted
   * token that cannot list the account's Actors.
   */
  async validateApiAuthentication(): Promise<ApifyUserProfile> {
    if (!this.apiToken) {
      throw new ApifyClientError(
        "unauthorized",
        "An Apify API key is required for Actor operations",
        { status: 401 },
      );
    }
    const me = await this.getMe();
    if (!me) {
      throw new ApifyClientError("unauthorized", "Apify rejected the API key", { status: 401 });
    }
    try {
      await this.listMyActors({ limit: 1 });
    } catch (error) {
      // A restricted key can authenticate `/users/me` but still be unable to
      // perform the Actor inventory/write workflow. Treat that capability
      // failure as an authentication issue for credential-health purposes.
      const mapped = toApifyClientError(error);
      await this.reportCredentialError("api", mapped, true);
      throw mapped;
    }
    return me;
  }

  async getPublicUser(username: string): Promise<ApifyUserProfile | null> {
    if (!username) return null;
    return this.wrap(async () => {
      const u = await this.raw.user(username).get();
      return u ? toUserProfile(u) : null;
    });
  }

  async getRun(runId: string): Promise<ApifyRun | null> {
    return this.wrap(async () => {
      const r = await this.raw.run(runId).get();
      return r ? toRun(r) : null;
    });
  }

  async getLatestPublicRun(usernameActor: ApifyActorId): Promise<ApifyRun | null> {
    return this.wrap(async () => {
      const list = await this.raw.actor(usernameActor).runs().list({ limit: 1, desc: true });
      const first = list.items[0];
      return first ? toRun(first) : null;
    });
  }

  async listActorRuns(
    actorId: ApifyActorId,
    opts: { limit?: number; offset?: number; startedAfter?: string; desc?: boolean } = {},
  ): Promise<ApifyRun[]> {
    const response = await this.getApi<{ data?: { items?: unknown[] } }>(
      `/v2/actors/${encodeURIComponent(actorId)}/runs`,
      {
        limit: String(opts.limit ?? 20),
        ...(opts.offset === undefined ? {} : { offset: String(opts.offset) }),
        ...(opts.startedAfter ? { startedAfter: opts.startedAfter } : {}),
        ...(opts.desc === undefined ? {} : { desc: opts.desc ? "1" : "0" }),
      },
    );
    return (response.data?.items ?? []).map(toRun);
  }

  async getDatasetItemCount(datasetId: string): Promise<number> {
    const response = await this.getApi<{ data?: { itemCount?: number } }>(
      `/v2/datasets/${encodeURIComponent(datasetId)}`,
    );
    return Math.max(0, Number(response.data?.itemCount) || 0);
  }

  async listMyActors(opts: { limit?: number; offset?: number } = {}): Promise<ApifyActorSummary[]> {
    return this.wrap(async () => {
      const list = await this.raw.actors().list({
        my: true,
        limit: opts.limit ?? 100,
        ...(opts.offset !== undefined ? { offset: opts.offset } : {}),
      });
      return list.items.map(toActorSummary);
    });
  }

  async searchStore(opts: ApifyStoreSearchOptions): Promise<ApifyStoreSearchResult[]> {
    return (await this.searchStorePage(opts)).items;
  }

  async searchStorePage(opts: ApifyStoreSearchOptions): Promise<ApifyStoreSearchPage> {
    const useConsoleSearch = opts.searchBackend !== "public" && this.hasConsoleAuth();
    const limit = Math.min(Math.max(opts.limit ?? 24, 1), useConsoleSearch ? 100 : 1_000);
    const offset = Math.max(0, opts.offset ?? 0);
    if (useConsoleSearch) {
      const categories = [
        ...(Array.isArray(opts.category) ? opts.category : opts.category ? [opts.category] : []),
        ...(opts.categoryRefinements ?? []),
      ].filter((value, index, values) => value && values.indexOf(value) === index);
      const filterByMetaLabels = opts.filterByMetaLabels ?? opts.categoryRefinements !== undefined;
      const query = new URLSearchParams();
      query.set("search", opts.q);
      for (const category of categories) query.append("category", category);
      if (opts.recommId) query.set("recommId", opts.recommId);
      else query.set("offset", String(offset));
      query.set("filterByMetaLabels", filterByMetaLabels ? "true" : "false");
      query.set("limit", String(limit));
      query.set("searchIndex", opts.searchIndex ?? "recombee");
      query.set("sortBy", opts.sortBy ?? "relevance");
      if (opts.searchConfigurationId) {
        query.set("searchConfigurationId", opts.searchConfigurationId);
      }
      if (opts.searchScenario) query.set("searchScenario", opts.searchScenario);
      if (opts.algoliaIndexSuffix) query.set("algoliaIndexSuffix", opts.algoliaIndexSuffix);
      if (opts.pricingModel) query.set("pricing", opts.pricingModel);
      if (opts.managedBy) query.set("managedBy", opts.managedBy);
      for (const tag of opts.analyticsTags ?? []) query.append("analyticsTags", tag);
      if (opts.clickAnalytics !== undefined) {
        query.set("clickAnalytics", opts.clickAnalytics ? "true" : "false");
      }
      if (opts.userToken) query.set("userToken", opts.userToken);
      const response = await this.consoleRequest<{
        items?: unknown[];
        data?: {
          items?: unknown[];
          totalResults?: number;
          usedIndex?: string;
          recommId?: string;
          queryID?: string;
          queryId?: string;
          facets?: unknown[];
        };
        totalResults?: number;
        usedIndex?: string;
        recommId?: string;
        queryID?: string;
        queryId?: string;
        facets?: unknown[];
      }>(`/public/store/search?${query.toString()}`);
      const responseFacets = normalizeStoreFacets(response.facets ?? response.data?.facets);
      const facets =
        opts.includeFacets && categories.length > 0 && responseFacets.length === 0
          ? await this.getStoreFacets(categories)
          : responseFacets;
      return {
        items: (response.items ?? response.data?.items ?? [])
          .map(toConsoleStoreSearchResult)
          .slice(0, limit),
        totalResults:
          numberOrUndefined(response.totalResults ?? response.data?.totalResults) ?? null,
        usedIndex: response.usedIndex ?? response.data?.usedIndex ?? null,
        recommId: response.recommId ?? response.data?.recommId ?? null,
        queryId:
          response.queryID ??
          response.queryId ??
          response.data?.queryID ??
          response.data?.queryId ??
          null,
        facets,
        offset,
        limit,
      };
    }
    return this.wrap(async () => {
      const list = await this.raw.store().list({
        search: opts.q,
        limit,
        offset,
        ...(opts.sortBy ? { sortBy: opts.sortBy } : {}),
        ...(opts.category
          ? { category: Array.isArray(opts.category) ? opts.category[0] : opts.category }
          : {}),
        ...(opts.pricingModel ? { pricingModel: opts.pricingModel } : {}),
        includeUnrunnableActors: opts.includeUnrunnableActors ?? true,
      } as any);
      return {
        items: list.items.map(toStoreSearchResult),
        totalResults: numberOrUndefined((list as { total?: unknown }).total) ?? null,
        usedIndex: "public-api",
        recommId: null,
        queryId: null,
        facets: [],
        offset,
        limit,
      };
    });
  }

  async getStoreFacets(categoryIds: string[] = []): Promise<ApifyStoreFacet[]> {
    const query = new URLSearchParams();
    for (const categoryId of categoryIds.filter(Boolean)) {
      query.append("categoryIds", categoryId);
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    const response = unwrapResponse(
      await this.consoleRequest<unknown>(`/public/store/facets${suffix}`),
    );
    return normalizeStoreFacets(response);
  }

  // ---------- writes: always throw on error ----------

  async updateActor(
    idOrUsernameName: ApifyActorId,
    fields: ApifyActorUpdateFields,
  ): Promise<ApifyActorDetail> {
    return this.wrap(async () => {
      if (!this.apiToken) throw actorOwnerPermissionError(idOrUsernameName);
      const updated = await this.raw.actor(idOrUsernameName).update(fields as any);
      if (!updated) {
        throw new ApifyClientError("unknown", "Apify returned no actor after update", {
          status: 502,
        });
      }
      return toActorDetail(updated);
    });
  }

  /** Match the Console publish action: publication changes visibility only. */
  async publishActor(idOrUsernameName: ApifyActorId): Promise<ApifyActorDetail> {
    return this.updateActor(idOrUsernameName, { isPublic: true });
  }

  /**
   * Read the publication checks that are observable without mutating the
   * Actor. Email fields are nullable because Apify does not expose them in
   * every API-token or organization context; the publish error remains the
   * authoritative fallback for those checks.
   */
  async getActorPublicationPreflight(
    idOrUsernameName: ApifyActorId,
  ): Promise<ApifyActorPublicationPreflight> {
    const [actor, user, basicInfo] = await Promise.all([
      this.getActor(idOrUsernameName),
      this.getMe().catch(() => null),
      this.getActorBasicInfo(idOrUsernameName).catch(() => null),
    ]);
    if (!actor) {
      throw new ApifyClientError("not_found", `Actor ${idOrUsernameName} was not found`, {
        status: 404,
      });
    }
    const taggedBuild = Object.values(actor.taggedBuilds ?? {}).some((build) =>
      Boolean(build?.buildId || build?.buildNumber),
    );
    const hasPublicProfileField =
      basicInfo !== null && Object.prototype.hasOwnProperty.call(basicInfo, "publicOwnerProfile");
    const publicProfile =
      user?.isProfilePublic ??
      (hasPublicProfileField ? Boolean(basicInfo?.publicOwnerProfile) : null);
    const verifiedEmail = user?.primaryEmailVerified ?? null;
    const nonDisposableEmail =
      user?.primaryEmailDisposable == null ? null : !user.primaryEmailDisposable;
    const blocking: ApifyActorPublicationPreflight["blocking"] = [];
    if (!taggedBuild) blocking.push("MISSING_TAGGED_BUILD");
    if (publicProfile === false) blocking.push("PUBLIC_PROFILE_REQUIRED");
    if (verifiedEmail === false) blocking.push("EMAIL_NOT_VERIFIED");
    if (nonDisposableEmail === false) blocking.push("DISPOSABLE_EMAIL");
    const unknown: ApifyActorPublicationPreflight["unknown"] = [];
    if (publicProfile === null) unknown.push("PUBLIC_PROFILE");
    if (verifiedEmail === null) unknown.push("VERIFIED_EMAIL");
    if (nonDisposableEmail === null) unknown.push("NON_DISPOSABLE_EMAIL");
    return {
      actorId: actor.id,
      checks: { taggedBuild, publicProfile, verifiedEmail, nonDisposableEmail },
      blocking,
      unknown,
    };
  }

  /**
   * Read the same marketplace metadata snapshot used by the Apify Console.
   * This is deliberately separate from getActor(), because the public API
   * response does not contain all fields that must be preserved during a
   * marketplace update.
   */
  async getActorBasicInfo(idOrUsernameName: ApifyActorId): Promise<ApifyActorBasicInfo> {
    if (!this.hasConsoleAuth() && this.apiToken) {
      const actor = await this.getActor(idOrUsernameName);
      if (!actor) {
        throw new ApifyClientError("not_found", `Actor ${idOrUsernameName} was not found`, {
          status: 404,
        });
      }
      return actorDetailToBasicInfo(actor);
    }
    try {
      return await this.consoleRequest<ApifyActorBasicInfo>(
        `/actor/${encodeURIComponent(idOrUsernameName)}/basic-info`,
      ).then((value) => normalizeActorBasicInfo(unwrapResponse(value)));
    } catch (error) {
      const mapped = toApifyClientError(error);
      // Console UI tokens are scoped to the organization currently selected
      // in Apify Console. A workspace API token can still own the Actor even
      // when that Console identity receives `insufficient-permissions` from
      // basic-info. Fall back to the canonical owner API in that case so a
      // mismatched Console organization does not break reads, status changes,
      // copy updates, or scheduled publishing.
      if (mapped.code !== "forbidden") throw mapped;
      if (!this.apiToken) throw actorOwnerPermissionError(idOrUsernameName, mapped);
      try {
        const actor = await this.getActor(idOrUsernameName);
        if (!actor) throw actorOwnerPermissionError(idOrUsernameName, mapped);
        return actorDetailToBasicInfo(actor);
      } catch (apiError) {
        const apiMapped = toApifyClientError(apiError);
        if (apiMapped.code === "forbidden" || apiMapped.code === "not_found") {
          throw actorOwnerPermissionError(idOrUsernameName, apiMapped);
        }
        throw apiMapped;
      }
    }
  }

  /**
   * Read the public text reviews that Apify Console shows for an Actor. This
   * deliberately uses Console auth: the public REST Actor response only
   * exposes the aggregate rating and count, not the review bodies.
   */
  async getActorTextReviews(actorId: string, limit = 20): Promise<ApifyActorTextReview[]> {
    const id = actorId.trim();
    if (!id) throw new ApifyClientError("validation", "An Actor ID is required", { status: 422 });
    const safeLimit = Math.min(50, Math.max(1, Math.trunc(limit)));
    const value = unwrapResponse(
      await this.consoleRequest<unknown>(
        `/actor/${encodeURIComponent(id)}/text-reviews?limit=${safeLimit}`,
      ),
    );
    const rows = Array.isArray(value)
      ? value
      : isRecord(value) && Array.isArray(value.items)
        ? value.items
        : [];
    return rows.filter(isRecord).map((review) => normalizeActorTextReview(review));
  }

  async submitActorCategoriesFeedback(
    actorId: ApifyActorId,
    details: string,
  ): Promise<ApifyActorCategoryFeedbackResult> {
    const normalized = details.trim();
    if (normalized.length < 10) {
      throw new ApifyClientError(
        "validation",
        "Category feedback must contain at least 10 characters",
        { status: 422 },
      );
    }
    await this.consoleRequest(`/actor/${encodeURIComponent(actorId)}/categories-feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ details: normalized }),
    });
    return { submitted: true };
  }

  async getActorPricingInfo(actorId: ApifyActorId, date?: string): Promise<unknown> {
    const query = new URLSearchParams();
    if (date) query.set("date", date);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return unwrapResponse(
      await this.consoleRequest(`/actor/${encodeURIComponent(actorId)}/pricing-info${suffix}`),
    );
  }

  async getActorBuildInfo(actorId: ApifyActorId, tagOrVersion: string): Promise<unknown> {
    return unwrapResponse(
      await this.consoleRequest(
        `/actor/${encodeURIComponent(actorId)}/build-info/${encodeURIComponent(tagOrVersion)}`,
      ),
    );
  }

  async getActorPermissionsApproval(actorId: ApifyActorId): Promise<unknown> {
    return unwrapResponse(
      await this.consoleRequest(`/actor/${encodeURIComponent(actorId)}/permissions-approval`),
    );
  }

  /** Exchange Console cookies for the short-lived UI token documented by the Console backend. */
  async resumeConsoleAuthentication(): Promise<ApifyConsoleSession> {
    if (this.uiToken) {
      return {
        userId: "",
        uiToken: this.uiToken,
        hasElevatedPermissions: false,
        isAdmin: false,
      };
    }
    if (!this.cookies) {
      throw new ApifyClientError("unauthorized", "Apify Console cookies are not configured", {
        status: 401,
      });
    }
    this.resumedConsoleSession ??= this.resumeConsoleSessionFromCookies();
    return this.resumedConsoleSession;
  }

  /**
   * Read every notification shown by Apify Console's notification center.
   * Apify exposes this feed as a Socket.IO publication rather than a REST
   * collection, so the connection is closed immediately after its initial
   * snapshot is received.
   */
  async listConsoleNotifications(): Promise<ApifyConsoleNotification[]> {
    const value = await this.consolePublication<unknown>("userUiNotificationsPub", []);
    if (!Array.isArray(value)) return [];
    return value
      .map(normalizeConsoleNotification)
      .filter((item): item is ApifyConsoleNotification => item !== null);
  }

  /** Read authoritative totals for the API-key-backed Console inventory. */
  async getResourceInventory(): Promise<ApifyResourceInventory> {
    const resources = [
      ["actors", "/v2/acts", { my: "1", limit: "1" }],
      ["runs", "/v2/actor-runs", { limit: "1", desc: "1" }],
      ["datasets", "/v2/datasets", { limit: "1" }],
      ["keyValueStores", "/v2/key-value-stores", { limit: "1" }],
      ["requestQueues", "/v2/request-queues", { limit: "1" }],
    ] as const;
    const settled = await Promise.allSettled(
      resources.map(([, path, params]) =>
        this.getApi<{ data?: { total?: number; count?: number; items?: unknown[] } }>(path, params),
      ),
    );
    return Object.fromEntries(
      resources.map(([key], index) => {
        const result = settled[index];
        if (!result || result.status === "rejected") return [key, null];
        const data = result.value.data;
        const total = numberOrUndefined(data?.total ?? data?.count);
        return [key, total ?? data?.items?.length ?? null];
      }),
    ) as unknown as ApifyResourceInventory;
  }

  /** List organizations available to the current Console identity. */
  async listConsoleOrganizations(): Promise<ApifyConsoleOrganization[]> {
    const response = await this.consoleRequest<unknown>("/organizations");
    const value = unwrapResponse(response);
    if (!Array.isArray(value)) return [];
    return value
      .filter(isRecord)
      .map((organization) => ({
        id: String(organization._id ?? organization.id ?? ""),
        name: String(
          organization.name ?? organization.title ?? organization.username ?? "Organization",
        ),
        isOwner: Boolean(organization.isOwner),
        rolePermissions: Array.isArray(organization.rolePermissions)
          ? organization.rolePermissions.filter(
              (permission): permission is string => typeof permission === "string",
            )
          : [],
      }))
      .filter((organization) => Boolean(organization.id));
  }

  /** Read the usage windows used by Apify Console's Proxy usage screen. */
  async listProxyUsageCycles(): Promise<ApifyProxyUsageCycle[]> {
    const response = await this.consoleRequest<unknown>("/billing/monthly-usage-cycles");
    const value = unwrapResponse(response);
    if (!Array.isArray(value)) return [];
    return value
      .filter(isRecord)
      .map((cycle) => ({ startAt: String(cycle.startAt ?? ""), endAt: String(cycle.endAt ?? "") }))
      .filter((cycle) => Boolean(cycle.startAt && cycle.endAt));
  }

  /** Mark one Apify Console notification as displayed in the Console UI feed. */
  async markConsoleNotificationDisplayed(notificationId: string): Promise<void> {
    await this.consoleRequest(
      `/user-notifications/mark-notification-as-displayed-in-ui/${encodeURIComponent(notificationId)}`,
      { method: "PUT" },
    );
  }

  /** Mark one Apify Console notification as read. */
  async markConsoleNotificationRead(notificationId: string): Promise<void> {
    await this.consoleRequest(
      `/user-notifications/mark-notification-as-read-in-ui/${encodeURIComponent(notificationId)}`,
      { method: "PUT" },
    );
  }

  /** Mark the authenticated Apify user's complete Console notification feed as read. */
  async markAllConsoleNotificationsRead(): Promise<void> {
    await this.consoleRequest("/user-notifications/mark-all-notifications-as-read-in-ui", {
      method: "PUT",
    });
  }

  /** Read batched per-Actor owner monetization without the four unrelated analytics requests. */
  async getActorMonetization(actorIds: string[], month: string): Promise<ApifyActorBreakdown> {
    const ids = [...new Set(actorIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0 || ids.length > 30) {
      throw new ApifyClientError("validation", "Monetization accepts between 1 and 30 Actor IDs", {
        status: 422,
      });
    }
    if (!/^\d{4}-\d{2}-01$/.test(month)) {
      throw new ApifyClientError("validation", "Analytics month must use YYYY-MM-01", {
        status: 422,
      });
    }
    const query = new URLSearchParams({ month, actorIds: ids.join(",") }).toString();
    return this.consoleRequest<ApifyActorBreakdown>(
      `/actor-analytics/actor-breakdown?${query}`,
    ).then(unwrapResponse);
  }

  /** Read the owner analytics surfaces documented in APIFY.md without changing the Actor. */
  async getActorAnalytics(actorIds: string[], month: string): Promise<ApifyActorAnalytics> {
    const ids = [...new Set(actorIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) {
      throw new ApifyClientError("validation", "At least one Actor ID is required", {
        status: 422,
      });
    }
    if (!/^\d{4}-\d{2}-01$/.test(month)) {
      throw new ApifyClientError("validation", "Analytics month must use YYYY-MM-01", {
        status: 422,
      });
    }
    const query = new URLSearchParams({ month, actorIds: ids.join(",") }).toString();
    const [
      actorBreakdown,
      costsPerThousandResults,
      runStatistics,
      userCountStatistics,
      profitMargin,
    ] = await Promise.allSettled([
      this.consoleRequest<ApifyActorAnalytics["actorBreakdown"]>(
        `/actor-analytics/actor-breakdown?${query}`,
      ),
      this.consoleRequest<ApifyActorAnalytics["costsPerThousandResults"]>(
        `/actor-analytics/costs-per-thousand-results?${query}`,
      ),
      this.consoleRequest<ApifyActorRunStatistics>(
        `/actor-analytics/run-statistics/monthly/all-users?${query}`,
      ),
      this.consoleRequest<unknown>(`/actor-analytics/user-count-statistics?${query}`),
      this.consoleRequest<ApifyActorAnalytics["profitMargin"]>(
        `/actor-analytics/profit-margin?${query}`,
      ),
    ]);
    if (
      actorBreakdown.status === "rejected" &&
      costsPerThousandResults.status === "rejected" &&
      runStatistics.status === "rejected" &&
      userCountStatistics.status === "rejected" &&
      profitMargin.status === "rejected"
    ) {
      throw actorBreakdown.reason;
    }
    const analyticsError = (result: PromiseSettledResult<unknown>) =>
      result.status === "rejected" ? toApifyClientError(result.reason).message : undefined;
    return {
      month,
      actorIds: ids,
      actorBreakdown:
        actorBreakdown.status === "fulfilled" ? unwrapResponse(actorBreakdown.value) : {},
      costsPerThousandResults:
        costsPerThousandResults.status === "fulfilled"
          ? unwrapResponse(costsPerThousandResults.value)
          : {},
      runStatistics:
        runStatistics.status === "fulfilled"
          ? unwrapResponse(runStatistics.value)
          : { dailyStats: {} },
      userCountStatistics:
        userCountStatistics.status === "fulfilled"
          ? unwrapResponse(userCountStatistics.value)
          : null,
      profitMargin: profitMargin.status === "fulfilled" ? unwrapResponse(profitMargin.value) : {},
      availability: {
        actorBreakdown: actorBreakdown.status === "fulfilled",
        costsPerThousandResults: costsPerThousandResults.status === "fulfilled",
        runStatistics: runStatistics.status === "fulfilled",
        userCountStatistics: userCountStatistics.status === "fulfilled",
        profitMargin: profitMargin.status === "fulfilled",
      },
      errors: Object.fromEntries(
        Object.entries({
          actorBreakdown: analyticsError(actorBreakdown),
          costsPerThousandResults: analyticsError(costsPerThousandResults),
          runStatistics: analyticsError(runStatistics),
          userCountStatistics: analyticsError(userCountStatistics),
          profitMargin: analyticsError(profitMargin),
        }).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      ),
    };
  }

  /**
   * Read only the two Console analytics surfaces needed by actor detail pages.
   * Keeping this separate from the broader pricing analytics request avoids
   * making a chart unavailable when an unrelated cost or margin endpoint is
   * not enabled for the current account.
   */
  async getActorMetricAnalytics(
    actorIds: string[],
    month: string,
  ): Promise<ApifyActorMetricAnalytics> {
    const ids = [...new Set(actorIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) {
      throw new ApifyClientError("validation", "At least one Actor ID is required", {
        status: 422,
      });
    }
    if (!/^\d{4}-\d{2}-01$/.test(month)) {
      throw new ApifyClientError("validation", "Analytics month must use YYYY-MM-01", {
        status: 422,
      });
    }
    const query = new URLSearchParams({ month, actorIds: ids.join(",") }).toString();
    const [runStatistics, userCountStatistics] = await Promise.allSettled([
      this.consoleRequest<ApifyActorRunStatistics>(
        `/actor-analytics/run-statistics/monthly/all-users?${query}`,
      ),
      this.consoleRequest<unknown>(`/actor-analytics/user-count-statistics?${query}`),
    ]);
    if (runStatistics.status === "rejected" && userCountStatistics.status === "rejected") {
      throw runStatistics.reason;
    }
    return {
      month,
      actorIds: ids,
      runStatistics:
        runStatistics.status === "fulfilled" ? unwrapResponse(runStatistics.value) : null,
      userCountStatistics:
        userCountStatistics.status === "fulfilled"
          ? unwrapResponse(userCountStatistics.value)
          : null,
    };
  }

  /** Read Store discovery and conversion analytics from Console Insights. */
  async getActorAcquisition(
    actorIds: string[],
    monthStartAt: string,
    portionOfMonthElapsed?: number,
  ): Promise<ApifyActorAcquisition> {
    const ids = [...new Set(actorIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) {
      throw new ApifyClientError("validation", "At least one Actor ID is required", {
        status: 422,
      });
    }
    const parsed = new Date(monthStartAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new ApifyClientError("validation", "Acquisition month must be a valid date", {
        status: 422,
      });
    }
    const query = new URLSearchParams({
      actorIds: ids.join(","),
      monthStartAt: parsed.toISOString(),
      ...(portionOfMonthElapsed === undefined
        ? {}
        : { portionOfMonthElapsed: String(portionOfMonthElapsed) }),
    });
    const value = unwrapResponse(
      await this.consoleRequest<Partial<ApifyActorAcquisition>>(
        `/actor-analytics/monthly-marketing?${query.toString()}`,
      ),
    );
    return {
      monthStartAt: parsed.toISOString(),
      actorIds: ids,
      numUniqueViewingUsers: Number(value.numUniqueViewingUsers) || 0,
      numUniqueConsolePageViews: Number(value.numUniqueConsolePageViews) || 0,
      numUniqueUsersWithRun: Number(value.numUniqueUsersWithRun) || 0,
      topReferrers: value.topReferrers ?? [],
      topCountryCodes: value.topCountryCodes ?? [],
    };
  }

  /** Read the Actor quality score and the actionable Console recommendations. */
  async getActorQuality(actorId: string): Promise<ApifyActorQuality> {
    const id = actorId.trim();
    if (!id) {
      throw new ApifyClientError("validation", "An Actor ID is required", { status: 422 });
    }
    const [scores, feedback] = await Promise.allSettled([
      this.consoleRequest<ApifyActorQualityScores>(
        `/actor-quality/scores/${encodeURIComponent(id)}`,
      ),
      this.consoleRequest<{
        praises?: ApifyActorQualityFeedbackItem[];
        improvements?: ApifyActorQualityFeedbackItem[];
      }>(`/actor-quality/praises-and-improvements/${encodeURIComponent(id)}`),
    ]);
    if (scores.status === "rejected" && feedback.status === "rejected") throw scores.reason;
    const feedbackValue =
      feedback.status === "fulfilled" ? unwrapResponse(feedback.value) : undefined;
    return {
      scores: scores.status === "fulfilled" ? unwrapResponse(scores.value) : null,
      praises: feedbackValue?.praises ?? [],
      improvements: feedbackValue?.improvements ?? [],
    };
  }

  /**
   * Summarize the seven-day, user-consented debugging feed without returning
   * or persisting run IDs or user identifiers.
   */
  async getActorSharedRunSummary(
    actorIds: string[],
    limit = 100,
  ): Promise<ApifyActorSharedRunSummary> {
    const ids = [...new Set(actorIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) {
      throw new ApifyClientError("validation", "At least one Actor ID is required", {
        status: 422,
      });
    }
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
    const query = new URLSearchParams({
      page: "0",
      limit: String(safeLimit),
      "sort[finishedAt]": "-1",
      actorIds: ids.join(","),
    });
    const value = unwrapResponse(
      await this.consoleRequest<unknown>(`/actor-analytics/shared-runs?${query.toString()}`),
    );
    const root = isRecord(value) ? value : {};
    const items = Array.isArray(value)
      ? value
      : Array.isArray(root.items)
        ? root.items
        : Array.isArray(root.runs)
          ? root.runs
          : [];
    const statuses: Record<string, number> = {};
    const dailyRuns: Record<string, number> = {};
    let latestFinishedAt: string | null = null;
    for (const raw of items) {
      if (!isRecord(raw)) continue;
      const run = isRecord(raw.run) ? raw.run : raw;
      const status = String(run.status ?? "UNKNOWN").toUpperCase();
      statuses[status] = (statuses[status] ?? 0) + 1;
      const finishedAt =
        typeof run.finishedAt === "string"
          ? run.finishedAt
          : typeof run.startedAt === "string"
            ? run.startedAt
            : null;
      if (!finishedAt || Number.isNaN(Date.parse(finishedAt))) continue;
      const day = new Date(finishedAt).toISOString().slice(0, 10);
      dailyRuns[day] = (dailyRuns[day] ?? 0) + 1;
      if (!latestFinishedAt || Date.parse(finishedAt) > Date.parse(latestFinishedAt)) {
        latestFinishedAt = finishedAt;
      }
    }
    return {
      total: numberOrUndefined(root.total ?? root.totalCount) ?? items.length,
      sampled: items.filter(isRecord).length,
      retentionDays: 7,
      latestFinishedAt,
      statuses,
      dailyRuns,
    };
  }

  /** Account usage history used by the Usage & costs dashboard. */
  async getMonthlyUsages(firstMonthStartAt: string, lastMonthEndAt: string) {
    const query = new URLSearchParams({ firstMonthStartAt, lastMonthEndAt }).toString();
    return this.consoleRequest<ApifyMonthlyUsages>(`/users/monthly-usages?${query}`).then(
      unwrapResponse,
    );
  }

  async getActorUsageBreakdown(startAt: string, endAt: string) {
    const query = new URLSearchParams({ startAt, endAt }).toString();
    return this.consoleRequest<ApifyActorUsageBreakdownItem[]>(
      `/billing/actor-usage-breakdown?${query}`,
    ).then(unwrapResponse);
  }

  async getCalendarMonthUsage(monthStartAt: string) {
    const query = new URLSearchParams({ monthStartAt }).toString();
    return this.consoleRequest<ApifyCalendarMonthUsage>(
      `/users/calendar-month-usage-info?${query}`,
    ).then(unwrapResponse);
  }

  async getCurrentBillingCycleServiceBreakdown() {
    return this.consoleRequest<ApifyCurrentServiceBreakdown>(
      "/users/current-billing-cycle/service-breakdown",
    ).then(unwrapResponse);
  }

  /** Current account usage cycle from the stable, token-authenticated Apify API. */
  async getAccountMonthlyUsage(date?: string) {
    const result = await this.getApi<{ data: ApifyAccountMonthlyUsage }>(
      "/v2/users/me/usage/monthly",
      date ? { date } : undefined,
    );
    return result.data;
  }

  /** Current plan limits and consumption from the stable, token-authenticated Apify API. */
  async getAccountLimits() {
    const result = await this.getApi<{ data: ApifyAccountLimits }>("/v2/users/me/limits");
    return result.data;
  }

  /**
   * Verify Console publishing authentication with the authenticated Store
   * search documented in APIFY.md. This validates the configured UI token or
   * cookies without depending on, reading, or resolving a specific Actor.
   */
  async validateConsoleAuthentication(
    options: { verifyOrganizations?: boolean } = {},
  ): Promise<boolean> {
    await this.searchStorePage({
      q: "",
      limit: 1,
      offset: 0,
      sortBy: "relevance",
      searchIndex: "recombee",
      searchBackend: "console",
    });
    if (options.verifyOrganizations) await this.listConsoleOrganizations();
    return true;
  }

  /**
   * Upload an Actor picture through the Console's presigned upload flow.
   * Apify rejects arbitrary third-party image URLs for marketplace pictures,
   * so callers should use this method instead of sending an AI provider URL
   * directly to PUT /v2/actors/:id.
   */
  async uploadActorPicture(
    idOrUsernameName: ApifyActorId,
    picture: { fileName: string; contentType: string; body: Uint8Array | ArrayBuffer },
  ): Promise<string> {
    const response = await this.consoleRequest<unknown>(
      `/upload/actor-picture/${encodeURIComponent(idOrUsernameName)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-idempotency-key": cryptoRandomUuid() },
        body: JSON.stringify({ fileName: picture.fileName, contentType: picture.contentType }),
      },
    );
    const upload = unwrapResponse<unknown>(response) as {
      uploadUrl?: unknown;
      publicUrl?: unknown;
    } | null;
    if (typeof upload?.uploadUrl !== "string" || typeof upload.publicUrl !== "string") {
      throw new ApifyClientError("unknown", "Apify picture upload did not return upload URLs", {
        status: 502,
      });
    }

    const uploadResponse = await fetchWithRetries(
      upload.uploadUrl,
      {
        method: "PUT",
        headers: { "content-type": picture.contentType },
        body: picture.body as any,
      },
      this.retryOptions,
    );
    if (!uploadResponse.ok) {
      throw new ApifyClientError(
        mapStatusToCode(uploadResponse.status),
        `Apify picture upload failed with HTTP ${uploadResponse.status}`,
        { status: uploadResponse.status },
      );
    }
    return upload.publicUrl;
  }

  /**
   * Update marketplace metadata using the same read-preserve-write-verify
   * sequence as the .publish scripts.
   */
  async updateActorMetadata(
    idOrUsernameName: ApifyActorId,
    input: ApifyActorMetadataInput,
  ): Promise<ApifyActorMetadataResult> {
    const publicActor = await this.getActor(idOrUsernameName);
    if (!publicActor) {
      throw new ApifyClientError("not_found", `Actor ${idOrUsernameName} was not found`, {
        status: 404,
      });
    }

    let current: ApifyActorBasicInfo = {
      title: publicActor.title,
      description: publicActor.description,
      pictureUrl: publicActor.pictureUrl,
      categories: publicActor.categories,
      seoTitle: publicActor.seoTitle,
      seoDescription: publicActor.seoDescription,
    };
    if (this.hasConsoleAuth()) {
      current = await this.getActorBasicInfo(idOrUsernameName);
    }

    const title = input.title ?? current.title ?? publicActor.title ?? undefined;
    const description =
      input.description ?? current.description ?? publicActor.description ?? undefined;
    let pictureUrl = input.pictureUrl ?? current.pictureUrl ?? publicActor.pictureUrl ?? null;
    let usedHostedPicture = false;
    if (input.picture) {
      pictureUrl = await this.uploadActorPicture(idOrUsernameName, input.picture);
      usedHostedPicture = true;
    }

    const payload: Record<string, unknown> = {
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(pictureUrl ? { pictureUrl } : {}),
    };
    if (input.seoTitle !== undefined) payload.seoTitle = input.seoTitle;
    else if (current.seoTitle !== undefined) payload.seoTitle = current.seoTitle;
    if (input.seoDescription !== undefined) payload.seoDescription = input.seoDescription;
    else if (current.seoDescription !== undefined) payload.seoDescription = current.seoDescription;
    for (const field of PRESERVED_METADATA_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(current, field) && current[field] !== undefined) {
        payload[field] = current[field];
      }
    }

    await this.apiRequest(`/v2/actors/${encodeURIComponent(idOrUsernameName)}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-apify-request-origin": "WEB" },
      body: JSON.stringify(payload),
    });

    const verifiedActor = await this.getActor(idOrUsernameName);
    if (!verifiedActor) {
      throw new ApifyClientError("unknown", "Actor disappeared after metadata update", {
        status: 502,
      });
    }
    const verifiedBasic = this.hasConsoleAuth()
      ? await this.getActorBasicInfo(idOrUsernameName)
      : ({} satisfies ApifyActorBasicInfo);
    const actualTitle = verifiedBasic.title ?? verifiedActor.title;
    const actualDescription = verifiedBasic.description ?? verifiedActor.description;
    const actualPictureUrl = verifiedBasic.pictureUrl ?? verifiedActor.pictureUrl;
    const actualCategories = verifiedBasic.categories ?? verifiedActor.categories ?? [];
    if (
      (input.title !== undefined && actualTitle !== input.title) ||
      (input.description !== undefined && actualDescription !== input.description) ||
      (input.picture !== undefined && actualPictureUrl !== pictureUrl)
    ) {
      throw new ApifyClientError("unknown", "Apify metadata verification mismatch", {
        status: 502,
      });
    }

    return {
      actor: verifiedActor,
      pictureUrl: actualPictureUrl ?? null,
      categories: actualCategories,
      verified: true,
      usedHostedPicture,
    };
  }

  /** Update only Store lifecycle flags, then read them back for verification. */
  async updateActorStoreStatus(
    idOrUsernameName: ApifyActorId,
    input: ApifyActorStoreStatusInput,
  ): Promise<ApifyActorStoreStatusResult> {
    if (input.isDeprecated === undefined && input.underMaintenance === undefined) {
      throw new ApifyClientError("validation", "At least one Store status must be provided", {
        status: 422,
      });
    }
    const payload: ApifyActorUpdateFields = {};
    if (input.isDeprecated !== undefined) payload.isDeprecated = input.isDeprecated;
    if (input.underMaintenance !== undefined) {
      payload.notice = input.underMaintenance ? "UNDER_MAINTENANCE" : "NONE";
    }
    await this.apiRequest(`/v2/actors/${encodeURIComponent(idOrUsernameName)}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-apify-request-origin": "WEB" },
      body: JSON.stringify(payload),
    });
    const actor = await this.getActor(idOrUsernameName);
    if (!actor) {
      throw new ApifyClientError("unknown", "Actor disappeared after Store status update", {
        status: 502,
      });
    }
    // The API token owns the write and the canonical Actor read. A valid
    // Console credential can still be scoped to another organization, in
    // which case basic-info returns 403 even though the owner API write
    // succeeded. Do not turn that optional Console verification into a false
    // publishing failure.
    let basic: ApifyActorBasicInfo | null = null;
    if (this.hasConsoleAuth()) {
      try {
        basic = await this.getActorBasicInfo(idOrUsernameName);
      } catch (error) {
        // The API token owns the write. Console credentials are only an
        // optional verification/read surface and may expire independently.
        // Fall back to the canonical API Actor response for authentication or
        // transient Console failures so an optional verification request
        // cannot turn a successful lifecycle update into a failed operation.
        if (
          !(error instanceof ApifyClientError) ||
          ![
            "forbidden",
            "unauthorized",
            "not_found",
            "rate_limited",
            "network",
            "unknown",
          ].includes(error.code)
        ) {
          throw error;
        }
      }
    }
    const isDeprecated = Boolean(basic?.isDeprecated ?? actor.isDeprecated);
    const notice = String(basic?.notice ?? actor.notice ?? "NONE");
    const underMaintenance = notice === "UNDER_MAINTENANCE";
    if (
      (input.isDeprecated !== undefined && isDeprecated !== input.isDeprecated) ||
      (input.underMaintenance !== undefined && underMaintenance !== input.underMaintenance)
    ) {
      throw new ApifyClientError("unknown", "Apify Store status verification mismatch", {
        status: 502,
      });
    }
    return {
      isPublic: Boolean(basic?.isPublic ?? actor.isPublic),
      isDeprecated,
      underMaintenance,
      notice,
      verified: true,
    };
  }

  /**
   * Append a new pricing period while preserving every existing period. Apify
   * requires pricing changes for published Actors to start in the future, so
   * the default mirrors the source script's 15-day safety window.
   */
  async appendActorPricing(
    idOrUsernameName: ApifyActorId,
    pricing: ApifyPricingInfo,
    options: { startedAt?: string } = {},
  ): Promise<ApifyPricingUpdateResult> {
    const actor = await this.getActor(idOrUsernameName);
    if (!actor) {
      throw new ApifyClientError("not_found", `Actor ${idOrUsernameName} was not found`, {
        status: 404,
      });
    }
    const existing = actor.pricingInfos ?? [];
    // A matching historical period is not a duplicate when a newer period
    // superseded it. Only the newest scheduled/effective definition can make
    // this request a no-op; otherwise users could never return to an earlier
    // price configuration.
    const newest = [...existing]
      .sort((left, right) => {
        const leftTime = Date.parse(left.startedAt ?? left.createdAt ?? "");
        const rightTime = Date.parse(right.startedAt ?? right.createdAt ?? "");
        return (
          (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0)
        );
      })
      .at(-1);
    if (newest && samePricingDefinition(newest, pricing)) {
      return { actor, pricingInfos: existing, changed: false, startedAt: newest.startedAt };
    }

    const startedAt =
      options.startedAt ?? new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    if (!Number.isFinite(Date.parse(startedAt)) || Date.parse(startedAt) <= Date.now()) {
      throw new ApifyClientError("validation", "Pricing changes must start in the future", {
        status: 422,
      });
    }
    const nextPricing: ApifyPricingInfo = {
      ...pricing,
      createdAt: pricing.createdAt ?? new Date().toISOString(),
      startedAt,
    };
    const nextPricingInfos = [...existing, nextPricing];
    await this.apiRequest(`/v2/actors/${encodeURIComponent(idOrUsernameName)}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-apify-request-origin": "WEB" },
      body: JSON.stringify({ pricingInfos: nextPricingInfos }),
    });

    const verifiedActor = await this.getActor(idOrUsernameName);
    if (!verifiedActor) {
      throw new ApifyClientError("unknown", "Actor disappeared after pricing update", {
        status: 502,
      });
    }
    const saved = (verifiedActor.pricingInfos ?? []).find(
      (entry) => entry.startedAt === startedAt && samePricingDefinition(entry, pricing),
    );
    if (!saved) {
      throw new ApifyClientError("unknown", "Apify pricing verification mismatch", {
        status: 502,
      });
    }
    return {
      actor: verifiedActor,
      pricingInfos: verifiedActor.pricingInfos ?? [],
      changed: true,
      startedAt: saved.startedAt,
    };
  }

  async startActorRun(
    idOrUsernameName: ApifyActorId,
    input: Record<string, unknown> = {},
  ): Promise<ApifyRun> {
    return this.wrap(async () => {
      const r = await this.raw.actor(idOrUsernameName).start(input);
      if (!r) {
        throw new ApifyClientError("unknown", "Apify returned no run after start", { status: 502 });
      }
      return toRun(r);
    });
  }

  async waitForRun(runId: string, waitSecs = 900): Promise<ApifyRun> {
    return this.wrap(async () => {
      const run = await this.raw.run(runId).waitForFinish({ waitSecs });
      return toRun(run);
    });
  }

  async getRunDatasetSample(
    runId: string,
    limit = 1,
  ): Promise<{ total: number; items: unknown[] }> {
    return this.wrap(async () => {
      const dataset = await this.raw.run(runId).dataset().listItems({ limit, clean: true });
      return { total: dataset.total, items: dataset.items };
    });
  }

  /** Escape hatch for callers that need an ApifyClient method we haven't wrapped yet. Use sparingly. */
  rawClient(): ApifyClient {
    return this.raw;
  }

  /**
   * Make an authenticated GET request to any Apify API v2 path.
   * Handles base URL, token, and JSON parsing automatically.
   */
  async getApi<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.raw.baseUrl ?? "https://api.apify.com");
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }
    return this.apiRequest<T>(url.toString(), { method: "GET", absoluteUrl: true });
  }

  // ---------- billing / revenue (Phase 4) ----------

  /**
   * Fetch daily billing usage for the authenticated account.
   * Returns an array of daily usage records with `amountUsd`, `actorId`, etc.
   */
  async getBillingDailyUsage(from: string, to: string): Promise<BillingDailyUsageItem[]> {
    const result = await this.getApi<{ data: { items: BillingDailyUsageItem[] } }>(
      "/v2/billing/daily-usage",
      {
        from,
        to,
      },
    );
    return result.data?.items ?? [];
  }

  // ---------- internal ----------

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      if (this.apiToken) await this.reportCredentialValid("api");
      return result;
    } catch (err) {
      // apify-client throws an object with statusCode, type, message. Map
      // everything; 404 already returned `null` above because we caught the
      // `info` falsy check, so any error reaching here is non-404.
      const mapped = toApifyClientError(err);
      if (this.apiToken) await this.reportCredentialError("api", mapped, false);
      throw mapped;
    }
  }

  private hasConsoleAuth(): boolean {
    return Boolean(this.uiToken || this.cookies);
  }

  private async apiRequest<T = unknown>(
    pathOrUrl: string,
    options: RequestInit & { absoluteUrl?: boolean } = {},
  ): Promise<T> {
    if (!this.apiToken) {
      throw new ApifyClientError(
        "unauthorized",
        "An Apify API key is required for Apify API operations",
        { status: 401 },
      );
    }
    const { absoluteUrl, ...requestOptions } = options;
    const url = absoluteUrl
      ? pathOrUrl
      : new URL(pathOrUrl, this.raw.baseUrl ?? "https://api.apify.com").toString();
    const headers = new Headers(requestOptions.headers);
    headers.set("accept", "application/json, text/plain, */*");
    headers.set("authorization", `Bearer ${this.apiToken}`);
    let response: Response;
    try {
      response = await fetchWithRetries(url, { ...requestOptions, headers }, this.retryOptions);
    } catch (error) {
      const mapped = toApifyClientError(error);
      await this.reportActiveApiCredentialError(mapped);
      throw mapped;
    }
    const text = await response.text();
    const body = parseResponseBody(text);
    if (!response.ok) {
      const error = new ApifyClientError(
        mapStatusToCode(response.status, responseErrorType(body)),
        `Apify API request failed with HTTP ${response.status}: ${errorMessage(body)}`,
        { status: response.status },
      );
      await this.reportActiveApiCredentialError(error);
      throw error;
    }
    await this.reportCredentialValid(
      this.apiToken ? "api" : this.uiToken || this.cookies ? "console" : "api",
    );
    return body as T;
  }

  private async consoleRequest<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
    if (!this.hasConsoleAuth()) {
      throw new ApifyClientError(
        "unauthorized",
        "An Apify UI token or Apify cookies are required for Apify Console operations",
        { status: 401 },
      );
    }
    const headers = new Headers(options.headers);
    headers.set("accept", "application/json, text/plain, */*");
    if (!headers.has("x-idempotency-key")) {
      headers.set("x-idempotency-key", cryptoRandomUuid());
    }
    let consoleToken: string | undefined;
    try {
      consoleToken = this.uiToken
        ? this.uiToken
        : this.cookies
          ? (await this.resumeConsoleAuthentication()).uiToken
          : undefined;
    } catch (error) {
      const mapped = toApifyClientError(error);
      await this.reportCredentialError("console", mapped, true);
      throw mapped;
    }
    if (consoleToken) headers.set("authorization", `Bearer ${consoleToken}`);
    if (this.cookies) headers.set("cookie", this.cookies);
    headers.set("origin", "https://console.apify.com");
    headers.set("referer", "https://console.apify.com/");
    let response: Response;
    try {
      response = await fetchWithRetries(
        `${CONSOLE_BACKEND_URL}${path}`,
        {
          ...options,
          headers,
        },
        this.retryOptions,
      );
    } catch (error) {
      const mapped = toApifyClientError(error);
      await this.reportCredentialError("console", mapped, false);
      throw mapped;
    }
    const text = await response.text();
    const body = parseResponseBody(text);
    if (!response.ok) {
      const error = new ApifyClientError(
        mapStatusToCode(response.status, responseErrorType(body)),
        `Apify Console request failed with HTTP ${response.status}: ${errorMessage(body)}`,
        { status: response.status },
      );
      await this.reportCredentialError("console", error, false);
      throw error;
    }
    await this.reportCredentialValid("console");
    return body as T;
  }

  private async consolePublication<T>(publicationName: string, params: unknown[]): Promise<T> {
    if (!this.hasConsoleAuth()) {
      throw new ApifyClientError(
        "unauthorized",
        "An Apify UI token or Apify cookies are required for Apify Console operations",
        { status: 401 },
      );
    }

    let consoleToken: string;
    try {
      consoleToken = (await this.resumeConsoleAuthentication()).uiToken;
    } catch (error) {
      const mapped = toApifyClientError(error);
      await this.reportCredentialError("console", mapped, true);
      throw mapped;
    }

    let socket: Socket | null = null;
    try {
      const initialData = await new Promise<T>((resolve, reject) => {
        let settled = false;
        const messageId = cryptoRandomUuid();
        const finish = (error?: unknown, data?: T) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          closeConsoleSocket(socket);
          socket = null;
          if (error !== undefined) reject(error);
          else resolve(data as T);
        };
        const timer = setTimeout(
          () =>
            finish(new ApifyClientError("network", "Apify Console notification sync timed out")),
          CONSOLE_PUBLICATION_TIMEOUT_MS,
        );

        socket = io(CONSOLE_BACKEND_URL, {
          transports: ["websocket"],
          forceNew: true,
          reconnection: false,
          timeout: CONSOLE_PUBLICATION_TIMEOUT_MS,
          extraHeaders: {
            origin: "https://console.apify.com",
            referer: "https://console.apify.com/",
          },
        });
        socket.once("connect_error", (error) => finish(error));
        socket.on(
          "exception",
          (response: {
            receivedData?: { messageId?: string };
            statusCode?: number;
            errorCode?: string;
            errorMessage?: string;
          }) => {
            if (response?.receivedData?.messageId !== messageId) return;
            finish(publicationResponseError(response));
          },
        );
        socket.on(
          "publication_error",
          (_subscriptionId: string, response: Record<string, unknown>) =>
            finish(publicationResponseError(response)),
        );
        socket.once("connect", () => {
          socket?.emit(
            "subscribe",
            { publicationName, uiToken: consoleToken, params, messageId },
            (response: {
              status?: string;
              id?: string;
              data?: T;
              error?: unknown;
              statusCode?: number;
              errorCode?: string;
              errorMessage?: string;
            }) => {
              if (response?.status === "ERROR" || response?.error) {
                finish(publicationResponseError(response));
                return;
              }
              if (response?.id) {
                socket?.emit("unsubscribe", {
                  id: response.id,
                  messageId: cryptoRandomUuid(),
                });
              }
              finish(undefined, response?.data as T);
            },
          );
        });
      });
      await this.reportCredentialValid("console");
      return initialData;
    } catch (error) {
      closeConsoleSocket(socket);
      const mapped = toApifyClientError(error);
      const authenticationFailure =
        mapped.code === "unauthorized" ||
        mapped.code === "forbidden" ||
        mapped.code === "validation";
      await this.reportCredentialError("console", mapped, authenticationFailure);
      throw mapped;
    }
  }

  private async resumeConsoleSessionFromCookies(): Promise<ApifyConsoleSession> {
    const response = await fetchWithRetries(
      `${CONSOLE_BACKEND_URL}/public/authentication/resume`,
      {
        method: "POST",
        headers: {
          accept: "application/json, text/plain, */*",
          "content-type": "application/json",
          cookie: this.cookies!,
          origin: "https://console.apify.com",
          referer: "https://console.apify.com/",
          "x-idempotency-key": cryptoRandomUuid(),
        },
        body: JSON.stringify({
          viewedUserId: this.consoleViewedUserId ?? "",
          forceAdminToken: false,
        }),
      },
      this.retryOptions,
    );
    const body = parseResponseBody(await response.text());
    if (!response.ok) {
      throw new ApifyClientError(
        mapStatusToCode(response.status),
        `Apify Console authentication resume failed with HTTP ${response.status}: ${errorMessage(body)}`,
        { status: response.status },
      );
    }
    const refreshedCookies = extractRotatedConsoleCookies(response.headers);
    if (refreshedCookies && refreshedCookies !== this.cookies) {
      this.cookies = refreshedCookies;
      await this.onConsoleCookieRefresh?.(refreshedCookies);
    }
    const session = unwrapResponse(body) as Partial<ApifyConsoleSession>;
    if (typeof session.userId !== "string" || typeof session.uiToken !== "string") {
      throw new ApifyClientError(
        "unknown",
        "Apify Console authentication resume returned an invalid response",
        { status: 502 },
      );
    }
    return {
      userId: session.userId,
      uiToken: session.uiToken,
      hasElevatedPermissions: Boolean(session.hasElevatedPermissions),
      isAdmin: Boolean(session.isAdmin),
    };
  }

  private async reportActiveApiCredentialError(error: ApifyClientError): Promise<void> {
    if (this.apiToken) await this.reportCredentialError("api", error, false);
    else if (this.uiToken || this.cookies) {
      await this.reportCredentialError("console", error, false);
    }
  }

  private async reportCredentialError(
    credential: "api" | "console",
    error: ApifyClientError,
    authentication: boolean,
  ): Promise<void> {
    try {
      await this.onCredentialError?.(credential, error, { authentication });
    } catch {
      // Credential-health persistence must never replace the original Apify error.
    }
  }

  private async reportCredentialValid(credential: "api" | "console"): Promise<void> {
    try {
      await this.onCredentialValid?.(credential);
    } catch {
      // Credential-health persistence must never fail a successful Apify request.
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseResponseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

type FetchRetryOptions = {
  maxRetries: number;
  minDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
  requestTimeoutMs: number;
};

async function fetchWithRetries(
  url: string,
  options: RequestInit,
  retryOptions: FetchRetryOptions,
): Promise<Response> {
  const maxRetries = isReplayableRequestBody(options.body) ? retryOptions.maxRetries : 0;
  let lastError: unknown;
  for (let retry = 0; retry <= maxRetries; retry += 1) {
    try {
      const timeoutSignal = AbortSignal.timeout(retryOptions.requestTimeoutMs);
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;
      const response = await fetch(url, { ...options, signal });
      const shouldRetry = await isRetryableResponse(response);
      if (!shouldRetry || retry === maxRetries) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
      await sleep(retryDelayMs(retry, response.headers, retryOptions));
    } catch (error) {
      lastError = error;
      if (retry === maxRetries) {
        throw new ApifyClientError("network", "Could not reach Apify", { cause: error });
      }
      await sleep(retryDelayMs(retry, undefined, retryOptions));
    }
  }
  throw new ApifyClientError("network", "Could not reach Apify", { cause: lastError });
}

async function isRetryableResponse(response: Response): Promise<boolean> {
  if (response.status >= 500) return true;
  if (response.status !== 429) return false;

  // Apify's 24-hour Actor publication quota is a product limit, not a
  // transient transport throttle. Return it immediately so the scheduler can
  // pause the queue until its next daily run instead of retrying the same
  // publication repeatedly.
  try {
    const body = parseResponseBody(await response.clone().text());
    return mapStatusToCode(response.status, responseErrorType(body)) !== "daily_publication_limit";
  } catch {
    return true;
  }
}

function retryDelayMs(
  retry: number,
  headers: Headers | undefined,
  options: FetchRetryOptions,
): number {
  const serverDelay = headers ? retryAfterMs(headers) : null;
  if (serverDelay !== null) return Math.min(options.maxDelayMs, Math.max(0, serverDelay));

  const exponential = Math.min(options.maxDelayMs, options.minDelayMs * 2 ** retry);
  if (options.jitterRatio === 0 || exponential === 0) return exponential;
  const jitter = exponential * options.jitterRatio * (Math.random() * 2 - 1);
  return Math.max(0, Math.min(options.maxDelayMs, Math.round(exponential + jitter)));
}

function retryAfterMs(headers: Headers): number | null {
  const retryAfter = headers.get("retry-after")?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }

  const resetAt = Number(headers.get("x-ratelimit-reset"));
  if (Number.isFinite(resetAt) && resetAt > 0) {
    const epochMs = resetAt > 10_000_000_000 ? resetAt : resetAt * 1_000;
    return Math.max(0, epochMs - Date.now());
  }
  return null;
}

function isReplayableRequestBody(body: RequestInit["body"]): boolean {
  if (body === null || body === undefined) return true;
  return !(typeof ReadableStream !== "undefined" && body instanceof ReadableStream);
}

function sleep(delayMs: number): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value!)));
}

function boundedNumber(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value!));
}

function errorMessage(body: unknown): string {
  if (typeof body === "object" && body !== null) {
    const record = body as {
      error?: { message?: string };
      errorMessage?: string;
      message?: string;
    };
    return record.error?.message ?? record.errorMessage ?? record.message ?? JSON.stringify(body);
  }
  return typeof body === "string" ? body : "unknown error";
}

function responseErrorType(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  const nestedError = isRecord(body.error) ? body.error : undefined;
  const candidate = body.errorCode ?? body.type ?? nestedError?.errorCode ?? nestedError?.type;
  return typeof candidate === "string" ? candidate : undefined;
}

function unwrapResponse<T = unknown>(body: T): T {
  if (typeof body === "object" && body !== null) {
    const record = body as { data?: unknown; actor?: unknown };
    if (record.data !== undefined) return record.data as T;
    if (record.actor !== undefined) return record.actor as T;
  }
  return body;
}

function publicationResponseError(response: {
  error?: unknown;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
}): ApifyClientError {
  const nested = isRecord(response.error) ? response.error : {};
  const statusCode = Number(response.statusCode ?? nested.statusCode) || null;
  const errorCode = String(response.errorCode ?? nested.errorCode ?? "");
  const message = String(
    response.errorMessage ?? nested.errorMessage ?? nested.message ?? "Apify publication failed",
  );
  return new ApifyClientError(mapStatusToCode(statusCode, errorCode), message, {
    status: statusCode,
  });
}

function closeConsoleSocket(socket: Socket | null): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
}

function normalizeConsoleNotification(value: unknown): ApifyConsoleNotification | null {
  if (!isRecord(value)) return null;
  const id = typeof value._id === "string" ? value._id : "";
  const subject = typeof value.subject === "string" ? value.subject : "";
  if (!id || !subject) return null;
  const delivery = isRecord(value.deliveryStatus) ? value.deliveryStatus : {};
  const ui = isRecord(delivery.ui) ? delivery.ui : {};
  const channels = isRecord(value.channels) ? value.channels : {};
  const uiChannel = isRecord(channels.ui) ? channels.ui : undefined;
  return {
    _id: id,
    userId: typeof value.userId === "string" ? value.userId : "",
    kind: typeof value.kind === "string" ? value.kind : "notification",
    createdAt:
      typeof value.createdAt === "string"
        ? value.createdAt
        : value.createdAt instanceof Date
          ? value.createdAt.toISOString()
          : new Date(0).toISOString(),
    subject,
    body: typeof value.body === "string" ? value.body : "",
    url: typeof value.url === "string" ? value.url : null,
    ...(uiChannel ? { channels: { ui: uiChannel } } : {}),
    deliveryStatus: {
      ui: {
        ...(typeof ui.displayedAt === "string" ? { displayedAt: ui.displayedAt } : {}),
        ...(typeof ui.readAt === "string" ? { readAt: ui.readAt } : {}),
      },
    },
  };
}

function cryptoRandomUuid(): string {
  // `crypto.randomUUID()` is available in supported Node runtimes. Keeping it
  // behind this helper makes the request construction easy to test.
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function samePricingDefinition(left: ApifyPricingInfo, right: ApifyPricingInfo): boolean {
  if (left.pricingModel !== right.pricingModel) return false;
  if (left.pricingModel === "PAY_PER_EVENT") {
    const leftEvents = left.pricingPerEvent?.actorChargeEvents ?? {};
    const rightEvents = right.pricingPerEvent?.actorChargeEvents ?? {};
    const normalize = (events: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(events)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => {
            const event = value as Record<string, unknown>;
            return [
              key,
              {
                eventPriceUsd: event.eventPriceUsd,
                eventTitle: event.eventTitle,
                eventDescription: event.eventDescription,
                isOneTimeEvent: event.isOneTimeEvent,
                isPrimaryEvent: event.isPrimaryEvent,
              },
            ];
          }),
      );
    return (
      JSON.stringify(normalize(leftEvents)) === JSON.stringify(normalize(rightEvents)) &&
      (left.minimalMaxTotalChargeUsd ?? null) === (right.minimalMaxTotalChargeUsd ?? null) &&
      (left.isPPEPlatformUsagePaidByUser ?? null) ===
        (right.isPPEPlatformUsagePaidByUser ?? null) &&
      (left.isPriceChangeNotificationSuppressed ?? null) ===
        (right.isPriceChangeNotificationSuppressed ?? null) &&
      (left.apifyMarginPercentage ?? null) === (right.apifyMarginPercentage ?? null)
    );
  }
  return (
    (left.pricePerUnitUsd ?? null) === (right.pricePerUnitUsd ?? null) &&
    (left.unitName ?? null) === (right.unitName ?? null)
  );
}

// ---------- mappers: apify-client raw → DTO (the single cast boundary) ----------

function toActorSummary(a: any): ApifyActorSummary {
  const username: string = a.username ?? "unknown";
  const name: string = a.name ?? a.id;
  const hasPublicFlag = typeof a.isPublic === "boolean";
  const hasDeprecatedFlag = typeof a.isDeprecated === "boolean";
  const hasNoticeField =
    Object.prototype.hasOwnProperty.call(a, "notice") &&
    (a.notice === null || typeof a.notice === "string");
  return {
    id: a.id,
    username,
    name,
    title: a.title ?? null,
    description: a.description ?? null,
    pictureUrl: a.pictureUrl ?? null,
    // `actors().list({ my: true })` returns a compact item containing only
    // id/name/owner fields. Keep the historical public discovery default for
    // callers that use this summary list, while `storeStatusAvailable` lets
    // lifecycle-aware inventory code distinguish a real flag from a default.
    isPublic: hasPublicFlag ? a.isPublic : true,
    isDeprecated: Boolean(a.isDeprecated),
    notice: typeof a.notice === "string" ? a.notice : null,
    storeStatusAvailable: hasPublicFlag || hasDeprecatedFlag || hasNoticeField,
    storeVisibilityAvailable: hasPublicFlag,
    storeDeprecationAvailable: hasDeprecatedFlag,
    storeNoticeAvailable: hasNoticeField,
    stats: a.stats
      ? {
          totalRuns: a.stats.totalRuns,
          totalUsers: a.stats.totalUsers,
          monthlyUsers: a.stats.monthlyUsers,
          totalUsers7Days: a.stats.totalUsers7Days,
          totalUsers30Days: a.stats.totalUsers30Days,
          totalUsers90Days: a.stats.totalUsers90Days,
          lastRunStartedAt: a.stats.lastRunStartedAt,
          rating: a.stats.rating ?? a.stats.actorReviewRating,
          actorReviewCount: a.stats.actorReviewCount,
          actorReviewRating: a.stats.actorReviewRating,
          bookmarkCount: a.stats.bookmarkCount,
          publicActorRunStats30Days: a.stats.publicActorRunStats30Days,
        }
      : null,
    totalUsers: a.totalUsers,
    totalRuns: a.totalRuns,
    currentRunCount: a.currentRunCount,
    categories: stringArray(a.categories),
    pricingInfos: a.pricingInfos ?? (a.currentPricingInfo ? [a.currentPricingInfo] : undefined),
    createdAt: a.createdAt,
    modifiedAt: a.modifiedAt,
    firstPublishedAt:
      a.firstPublishedAt instanceof Date
        ? Number.isFinite(a.firstPublishedAt.getTime())
          ? a.firstPublishedAt.toISOString()
          : undefined
        : typeof a.firstPublishedAt === "string"
          ? a.firstPublishedAt
          : undefined,
    userFullName: a.userFullName ?? null,
    userPictureUrl: a.userPictureUrl ?? null,
    reviewCount: a.actorReviewCount ?? a.stats?.actorReviewCount,
    reviewRating: a.actorReviewRating ?? a.stats?.actorReviewRating,
    metaLabels: Array.isArray(a.metaLabels)
      ? a.metaLabels
          .map((label: unknown) =>
            typeof label === "string"
              ? label
              : isRecord(label)
                ? String(label.name ?? label._id ?? "")
                : "",
          )
          .filter(Boolean)
      : undefined,
    metaLabelDetails: normalizeMetaLabels(a.metaLabels),
    url: `https://apify.com/${username}/${name}`,
  };
}

function toActorDetail(a: any): ApifyActorDetail {
  return {
    ...toActorSummary(a),
    readme: a.readme ?? null,
    seoTitle: a.seoTitle ?? null,
    seoDescription: a.seoDescription ?? null,
    inputSchema: a.inputSchema,
    outputSchema: a.outputSchema,
    defaultRunInput: a.defaultRunInput,
    taggedBuilds: normalizeTaggedBuilds(a.taggedBuilds),
    actorPermissionLevel:
      typeof a.actorPermissionLevel === "string" ? a.actorPermissionLevel : null,
    exampleRunInput: isRecord(a.exampleRunInput)
      ? {
          ...(typeof a.exampleRunInput.body === "string" ? { body: a.exampleRunInput.body } : {}),
          ...(typeof a.exampleRunInput.contentType === "string"
            ? { contentType: a.exampleRunInput.contentType }
            : {}),
        }
      : null,
  };
}

function actorDetailToBasicInfo(actor: ApifyActorDetail): ApifyActorBasicInfo {
  return {
    id: actor.id,
    username: actor.username,
    name: actor.name,
    title: actor.title,
    description: actor.description,
    pictureUrl: actor.pictureUrl,
    categories: actor.categories,
    isDeprecated: actor.isDeprecated,
    isPublic: actor.isPublic,
    notice: actor.notice,
    seoTitle: actor.seoTitle,
    seoDescription: actor.seoDescription,
    stats: actor.stats ?? undefined,
    pricingInfos: actor.pricingInfos,
    createdAt: actor.createdAt,
    modifiedAt: actor.modifiedAt,
    metaLabels: actor.metaLabels?.map((name) => ({ name })),
  };
}

function normalizeActorTextReview(review: Record<string, unknown>): ApifyActorTextReview {
  const author = isRecord(review.author) ? review.author : {};
  const reply = isRecord(review.reply)
    ? review.reply
    : isRecord(review.developerReply)
      ? review.developerReply
      : {};
  const number = Number(review.rating ?? 0);
  return {
    id: String(review._id ?? review.id ?? ""),
    rating: Number.isFinite(number) ? number : 0,
    text: stringOrNull(review.textReview ?? review.text ?? review.review),
    createdAt: stringOrNull(review.createdAt ?? review.created_at),
    authorName: stringOrNull(author.name ?? author.displayName ?? review.authorName),
    authorUsername: stringOrNull(author.username ?? review.authorUsername),
    developerReply: stringOrNull(reply.text ?? reply.message ?? review.replyText),
    developerReplyAt: stringOrNull(reply.createdAt ?? review.replyCreatedAt),
  };
}

function actorOwnerPermissionError(
  idOrUsernameName: ApifyActorId,
  cause?: unknown,
): ApifyClientError {
  return new ApifyClientError(
    "forbidden",
    `The connected Apify API key cannot manage Actor ${idOrUsernameName}. Connect an API key from the Actor's owning Apify user or organization, then sync the workspace again. Console UI tokens and cookies do not grant Actor write access.`,
    { status: 403, cause },
  );
}

function toUserProfile(u: any): ApifyUserProfile {
  const username: string = u.username ?? "unknown";
  const profile = isRecord(u.profile) ? u.profile : {};
  const primaryEmail = isRecord(u.primaryEmail) ? u.primaryEmail : {};
  return {
    id: u.id,
    username,
    // `/v2/users/me` returns profile fields inside `profile`; retain the
    // top-level fallbacks for older/alternate Apify response shapes.
    name: profile.name ?? u.name ?? null,
    bio: profile.bio ?? u.bio ?? null,
    pictureUrl: profile.pictureUrl ?? u.pictureUrl ?? null,
    plan: u.plan
      ? { id: String(u.plan.id ?? ""), displayName: u.plan.displayName ?? String(u.plan.id ?? "") }
      : null,
    totalActors: u.totalActors,
    totalPublicActors: u.totalPublicActors,
    isProfilePublic: booleanOrNull(profile.isProfilePublic ?? u.isProfilePublic),
    primaryEmailVerified: booleanOrNull(
      u.primaryEmailVerified ?? primaryEmail.isVerified ?? u.emailVerified,
    ),
    primaryEmailDisposable: booleanOrNull(
      u.primaryEmailDisposable ?? primaryEmail.isDisposable ?? u.emailDisposable,
    ),
    url: `https://apify.com/${username}`,
  };
}

function toRun(r: any): ApifyRun {
  return {
    id: r.id,
    actId: r.actId,
    status: r.status,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    defaultDatasetId: r.defaultDatasetId,
    defaultKeyValueStoreId: r.defaultKeyValueStoreId,
    buildId: r.buildId,
    exitCode: r.exitCode,
    containerUrl: r.containerUrl,
    stats: r.stats,
    usageTotalUsd: r.usageTotalUsd,
    origin: r.meta?.origin,
  };
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date(0).toISOString();
}

function toStoreSearchResult(a: any): ApifyStoreSearchResult {
  const summary = toActorSummary(a);
  return {
    id: summary.id,
    username: summary.username,
    name: summary.name,
    title: summary.title,
    description: summary.description,
    pictureUrl: summary.pictureUrl,
    totalUsers: summary.totalUsers,
    totalRuns: summary.totalRuns,
    stats: summary.stats,
    categories: summary.categories,
    pricingInfos: summary.pricingInfos,
    userFullName: summary.userFullName,
    userPictureUrl: summary.userPictureUrl,
    reviewCount: summary.reviewCount,
    reviewRating: summary.reviewRating,
    metaLabels: summary.metaLabels,
    metaLabelDetails: summary.metaLabelDetails,
    createdAt: summary.createdAt,
    modifiedAt: summary.modifiedAt,
    firstPublishedAt: summary.firstPublishedAt,
    url: summary.url,
  };
}

function toConsoleStoreSearchResult(value: unknown): ApifyStoreSearchResult {
  const item = isRecord(value) ? value : {};
  const stats = isRecord(item.stats) ? item.stats : {};
  return toStoreSearchResult({
    ...item,
    id: String(item.id ?? item._id ?? ""),
    username: String(item.username ?? "unknown"),
    name: String(item.name ?? item.id ?? "actor"),
    stats: {
      ...stats,
      totalUsers: numberOrUndefined(stats.totalUsers ?? item.totalUsers),
      actorReviewCount: numberOrUndefined(item.actorReviewCount),
      actorReviewRating: numberOrUndefined(item.actorReviewRating),
      rating: numberOrUndefined(item.actorReviewRating ?? stats.rating),
    },
    totalUsers: numberOrUndefined(item.totalUsers ?? stats.totalUsers),
  });
}

function normalizeActorBasicInfo(value: ApifyActorBasicInfo): ApifyActorBasicInfo {
  const record = value as Record<string, unknown>;
  const rawStats = isRecord(record.stats) ? record.stats : {};
  return {
    ...value,
    id: String(record.id ?? record._id ?? ""),
    categories: stringArray(record.categories),
    metaLabels: normalizeMetaLabels(record.metaLabels),
    stats: {
      totalRuns: numberOrUndefined(rawStats.totalRuns),
      totalUsers: numberOrUndefined(rawStats.totalUsers),
      monthlyUsers: numberOrUndefined(rawStats.monthlyUsers ?? rawStats.totalUsers30Days),
      totalUsers7Days: numberOrUndefined(rawStats.totalUsers7Days),
      totalUsers30Days: numberOrUndefined(rawStats.totalUsers30Days),
      totalUsers90Days: numberOrUndefined(rawStats.totalUsers90Days),
      lastRunStartedAt:
        typeof rawStats.lastRunStartedAt === "string" ? rawStats.lastRunStartedAt : undefined,
      rating: numberOrUndefined(rawStats.actorReviewRating ?? rawStats.rating),
      actorReviewCount: numberOrUndefined(rawStats.actorReviewCount),
      actorReviewRating: numberOrUndefined(rawStats.actorReviewRating),
      bookmarkCount: numberOrUndefined(rawStats.bookmarkCount),
      publicActorRunStats30Days: isRecord(rawStats.publicActorRunStats30Days)
        ? {
            ABORTED: numberOrUndefined(rawStats.publicActorRunStats30Days.ABORTED),
            FAILED: numberOrUndefined(rawStats.publicActorRunStats30Days.FAILED),
            SUCCEEDED: numberOrUndefined(rawStats.publicActorRunStats30Days.SUCCEEDED),
            "TIMED-OUT": numberOrUndefined(rawStats.publicActorRunStats30Days["TIMED-OUT"]),
            TOTAL: numberOrUndefined(rawStats.publicActorRunStats30Days.TOTAL),
          }
        : undefined,
    },
  };
}

function normalizeStoreFacets(value: unknown): ApifyStoreFacet[] {
  const rows = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.facets)
      ? value.facets
      : [];
  return rows
    .filter(isRecord)
    .map((facet) => ({
      categoryId: String(facet.categoryId ?? facet.id ?? facet._id ?? ""),
      count: Math.max(0, numberOrUndefined(facet.count) ?? 0),
    }))
    .filter((facet) => Boolean(facet.categoryId));
}

function normalizeMetaLabels(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const labels = value
    .map((label) => {
      if (typeof label === "string") return { name: label };
      if (!isRecord(label)) return null;
      return {
        ...(typeof label._id === "string" ? { _id: label._id } : {}),
        ...(typeof label.name === "string" ? { name: label.name } : {}),
        ...(typeof label.type === "string" ? { type: label.type } : {}),
        ...(typeof label.value === "string" ? { value: label.value } : {}),
      };
    })
    .filter((label): label is NonNullable<typeof label> => Boolean(label));
  return labels.length > 0 ? labels : undefined;
}

function normalizeTaggedBuilds(value: unknown): ApifyActorDetail["taggedBuilds"] {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value).map(([tag, build]) => {
      if (!isRecord(build)) return [tag, null];
      return [
        tag,
        {
          ...(typeof build.buildId === "string" ? { buildId: build.buildId } : {}),
          ...(typeof build.buildNumber === "string" ? { buildNumber: build.buildNumber } : {}),
          ...(build.finishedAt ? { finishedAt: toIsoString(build.finishedAt) } : {}),
        },
      ];
    }),
  );
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.filter((entry): entry is string => typeof entry === "string"))];
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function extractRotatedConsoleCookies(headers: Headers): string | undefined {
  const headersWithSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const values = headersWithSetCookie.getSetCookie?.() ?? [];
  const candidates = values.length > 0 ? values : [headers.get("set-cookie") ?? ""];
  for (const value of candidates) {
    const match = value.match(/(?:^|[;,]\s*)ApifyRT=([^;,\s]+)/i);
    if (match?.[1]) return `ApifyRT=${match[1]}`;
  }
  return undefined;
}

export function createApifyClient(opts: CreateApifyClientOptions = {}): ApifyClientWrapper {
  return new ApifyClientWrapper(opts);
}

// Suppress unused warning when mapStatusToCode isn't called from here.
void mapStatusToCode;
