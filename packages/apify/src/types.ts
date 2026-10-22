/**
 * Strongly-typed DTOs for the Apify REST surface the app actually consumes.
 * Field names mirror the Apify API 1:1; mappers in `client.ts` translate
 * from the SDK's loose `Record<string, any>` to these shapes.
 */

export type ApifyActorId = string; // accepts "username~name" OR "username/name"

export type PricingModel =
  "FREE" | "FLAT_PRICE_PER_MONTH" | "PRICE_PER_DATASET_ITEM" | "PAY_PER_EVENT";

export interface ApifyActorStats {
  totalRuns?: number;
  totalUsers?: number;
  monthlyUsers?: number;
  totalUsers7Days?: number;
  totalUsers30Days?: number;
  totalUsers90Days?: number;
  lastRunStartedAt?: string;
  rating?: number;
  actorReviewCount?: number;
  actorReviewRating?: number;
  bookmarkCount?: number;
  publicActorRunStats30Days?: {
    ABORTED?: number;
    FAILED?: number;
    SUCCEEDED?: number;
    "TIMED-OUT"?: number;
    TOTAL?: number;
  };
}

export interface ApifyEventPrice {
  eventPriceUsd: number;
  eventTitle: string;
  eventDescription?: string;
  isOneTimeEvent?: boolean;
  isPrimaryEvent?: boolean;
}

export interface ApifyPricingInfo {
  pricingModel: PricingModel;
  pricePerUnitUsd?: number;
  unitName?: string;
  trialMinutes?: number;
  startedAt?: string;
  createdAt?: string;
  minimalMaxTotalChargeUsd?: number;
  isPPEPlatformUsagePaidByUser?: boolean;
  isPriceChangeNotificationSuppressed?: boolean;
  apifyMarginPercentage?: number;
  reasonForChange?: string;
  pricingPerEvent?: { actorChargeEvents: Record<string, ApifyEventPrice> };
}

export interface ApifyActorSummary {
  id: string;
  username: string;
  name: string;
  title: string | null;
  description: string | null;
  pictureUrl: string | null;
  isPublic: boolean;
  isDeprecated?: boolean;
  notice?: "NONE" | "RESIDENTIAL_PROXY_REQUIRED" | "UNDER_MAINTENANCE" | null;
  stats: ApifyActorStats | null;
  totalUsers?: number;
  totalRuns?: number;
  currentRunCount?: number;
  categories?: string[];
  /** Lossless grouped labels assigned by Apify's category system. */
  metaLabelDetails?: ApifyActorMetaLabel[];
  pricingInfos?: ApifyPricingInfo[];
  createdAt?: string;
  modifiedAt?: string;
  userFullName?: string | null;
  userPictureUrl?: string | null;
  reviewCount?: number;
  reviewRating?: number;
  metaLabels?: string[];
  /** True when the list response itself contained Store lifecycle fields. */
  storeStatusAvailable?: boolean;
  /** True when the list response explicitly contained the visibility flag. */
  storeVisibilityAvailable?: boolean;
  /** True when the list response explicitly contained the deprecation flag. */
  storeDeprecationAvailable?: boolean;
  /** True when the list response explicitly contained the Store notice. */
  storeNoticeAvailable?: boolean;
  /** Derived: `https://apify.com/${username}/${name}`. Always present. */
  url: string;
}

export interface ApifyActorDetail extends ApifyActorSummary {
  readme: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  inputSchema: unknown;
  outputSchema: unknown;
  defaultRunInput?: unknown;
  taggedBuilds?: Record<
    string,
    { buildId?: string; buildNumber?: string; finishedAt?: string } | null
  >;
  actorPermissionLevel?: "LIMITED_PERMISSIONS" | "FULL_PERMISSIONS" | string | null;
  exampleRunInput?: { body?: string; contentType?: string } | null;
}

/** Artifacts resolved by Apify in the Actor's default build. */
export interface ApifyActorBuildArtifacts {
  readme: string | null;
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  keyValueStoreSchema: Record<string, unknown> | null;
}

export interface ApifyActorMetaLabel {
  _id?: string;
  name?: string;
  type?: "USE_CASE" | "INDUSTRY" | "OUTPUT" | "DOMAIN" | "LABEL" | string;
  value?: string;
}

/** A public text review returned by the Apify Console review endpoint. */
export interface ApifyActorTextReview {
  id: string;
  rating: number;
  text: string | null;
  createdAt: string | null;
  authorName: string | null;
  authorUsername: string | null;
  developerReply: string | null;
  developerReplyAt: string | null;
}

export interface ApifyPlan {
  id: string;
  displayName: string;
}

export interface ApifyUserProfile {
  id: string;
  username: string;
  name: string | null;
  bio: string | null;
  pictureUrl: string | null;
  plan: ApifyPlan | null;
  totalActors?: number;
  totalPublicActors?: number;
  /** Publication eligibility fields are not present in every API-token context. */
  isProfilePublic?: boolean | null;
  primaryEmailVerified?: boolean | null;
  primaryEmailDisposable?: boolean | null;
  /** Derived: `https://apify.com/${username}`. Always present. */
  url: string;
}

export interface ApifyRunStats {
  inputBodyLen?: number;
  outputBodyLen?: number;
  durationMs?: number;
  restartCount?: number;
  memAvgBytes?: number;
  memMaxBytes?: number;
  memCurrentBytes?: number;
  cpuAvgUsage?: number;
  cpuMaxUsage?: number;
  cpuCurrentUsage?: number;
  netRxBytes?: number;
  netTxBytes?: number;
}

export interface ApifyRun {
  id: string;
  actId: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  defaultDatasetId?: string;
  defaultKeyValueStoreId?: string;
  buildId?: string;
  exitCode?: number;
  containerUrl?: string;
  stats?: ApifyRunStats;
  usageTotalUsd?: number;
  origin?: string;
}

export interface ApifyStoreSearchResult {
  id: string;
  username: string;
  name: string;
  title: string | null;
  description: string | null;
  pictureUrl: string | null;
  totalUsers?: number;
  totalRuns?: number;
  stats: ApifyActorStats | null;
  categories?: string[];
  pricingInfos?: ApifyPricingInfo[];
  userFullName?: string | null;
  userPictureUrl?: string | null;
  reviewCount?: number;
  reviewRating?: number;
  metaLabels?: string[];
  metaLabelDetails?: ApifyActorMetaLabel[];
  createdAt?: string;
  modifiedAt?: string;
  firstPublishedAt?: string;
  url: string;
}

export interface ApifyActorUpdateFields {
  title?: string;
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  readme?: string;
  pictureUrl?: string;
  isPublic?: boolean;
  isDeprecated?: boolean;
  notice?: "NONE" | "RESIDENTIAL_PROXY_REQUIRED" | "UNDER_MAINTENANCE" | null;
  pricingInfos?: ApifyPricingInfo[];
}

/**
 * The metadata returned by Apify's Console backend. The public API does not
 * expose all of the marketplace fields needed to safely preserve an Actor's
 * existing state during a metadata update, so the fields are intentionally
 * kept separate from the public Actor DTO.
 */
export interface ApifyActorBasicInfo {
  id?: string;
  userId?: string;
  createdAt?: string;
  modifiedAt?: string;
  firstPublishedAt?: string;
  title?: string | null;
  description?: string | null;
  pictureUrl?: string | null;
  categories?: string[];
  isSourceCodeHidden?: boolean;
  isDeprecated?: boolean;
  isPublic?: boolean;
  notice?: string | null;
  customStatus?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  username?: string;
  name?: string;
  stats?: ApifyActorStats;
  pricingInfos?: ApifyPricingInfo[];
  metaLabels?: ApifyActorMetaLabel[];
  publicOwnerProfile?: {
    username?: string;
    dnsFriendlyUsername?: string;
    displayName?: string;
    name?: string;
    pictureUrl?: string;
  } | null;
  [key: string]: unknown;
}

export interface ApifyActorPictureUpload {
  fileName: string;
  contentType: string;
  body: Uint8Array | ArrayBuffer;
}

export interface ApifyActorMetadataInput {
  title?: string;
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  pictureUrl?: string;
  picture?: ApifyActorPictureUpload;
}

export interface ApifyActorMetadataResult {
  actor: ApifyActorDetail;
  pictureUrl: string | null;
  categories: string[];
  verified: boolean;
  usedHostedPicture: boolean;
}

export interface ApifyActorCategoryFeedbackResult {
  submitted: true;
}

export interface ApifyStoreFacet {
  categoryId: string;
  count: number;
}

export interface ApifyActorPublicationPreflight {
  actorId: string;
  checks: {
    taggedBuild: boolean;
    publicProfile: boolean | null;
    verifiedEmail: boolean | null;
    nonDisposableEmail: boolean | null;
  };
  blocking: Array<
    "MISSING_TAGGED_BUILD" | "PUBLIC_PROFILE_REQUIRED" | "EMAIL_NOT_VERIFIED" | "DISPOSABLE_EMAIL"
  >;
  unknown: Array<"PUBLIC_PROFILE" | "VERIFIED_EMAIL" | "NON_DISPOSABLE_EMAIL">;
}

export interface ApifyActorStoreStatusInput {
  isDeprecated?: boolean;
  underMaintenance?: boolean;
}

export interface ApifyActorStoreStatusResult {
  isPublic: boolean;
  isDeprecated: boolean;
  underMaintenance: boolean;
  notice: string | null;
  verified: boolean;
}

export interface ApifyPricingUpdateResult {
  actor: ApifyActorDetail;
  pricingInfos: ApifyPricingInfo[];
  changed: boolean;
  startedAt?: string;
}

export type ApifyStoreSort = "relevance" | "popularity" | "newest" | "lastUpdate" | "rating";
export type ApifyStoreSearchIndex = "recombee" | "algolia";
export type ApifyStoreSearchBackend = "console" | "public";

export interface ApifyStoreSearchOptions {
  q: string;
  limit?: number;
  offset?: number;
  category?: string | string[];
  categoryRefinements?: string[];
  filterByMetaLabels?: boolean;
  includeFacets?: boolean;
  recommId?: string;
  pricingModel?: PricingModel;
  managedBy?: string;
  sortBy?: ApifyStoreSort;
  searchIndex?: ApifyStoreSearchIndex;
  searchConfigurationId?: string;
  searchScenario?: string;
  algoliaIndexSuffix?: string;
  analyticsTags?: string[];
  clickAnalytics?: boolean;
  userToken?: string;
  searchBackend?: ApifyStoreSearchBackend;
  includeUnrunnableActors?: boolean;
}

export interface ApifyStoreSearchPage {
  items: ApifyStoreSearchResult[];
  totalResults: number | null;
  usedIndex: string | null;
  recommId: string | null;
  queryId: string | null;
  facets: ApifyStoreFacet[];
  offset: number;
  limit: number;
}

export interface ApifyConsoleSession {
  userId: string;
  uiToken: string;
  hasElevatedPermissions: boolean;
  isAdmin: boolean;
}

/**
 * A notification delivered by Apify Console's authenticated
 * `userUiNotificationsPub` publication. This is a live Console surface, not a
 * public v2 API response.
 */
export interface ApifyConsoleNotification {
  _id: string;
  userId: string;
  kind: string;
  createdAt: string;
  subject: string;
  body: string;
  url?: string | null;
  channels?: { ui?: Record<string, unknown> };
  deliveryStatus?: {
    ui?: {
      displayedAt?: string;
      readAt?: string;
    };
  };
}

export interface ApifyResourceInventory {
  actors: number | null;
  runs: number | null;
  datasets: number | null;
  keyValueStores: number | null;
  requestQueues: number | null;
}

export interface ApifyConsoleOrganization {
  id: string;
  name: string;
  isOwner: boolean;
  rolePermissions: string[];
}

export interface ApifyProxyUsageCycle {
  startAt: string;
  endAt: string;
}

export interface ApifyActorRunStatistics {
  dailyStats: Record<
    string,
    {
      ABORTED?: number;
      FAILED?: number;
      SUCCEEDED?: number;
      "TIMED-OUT"?: number;
      TOTAL?: number;
      RESULTS?: number;
    }
  >;
  runsSummary?: { min?: number; max?: number; avg?: number };
  resultsSummary?: { min?: number; max?: number; avg?: number };
}

/**
 * The Console backend has returned more than one user-count payload shape over
 * time. Keep the wire response intentionally open and normalize it at the UI
 * boundary instead of discarding fields we do not recognize yet.
 */
export type ApifyActorUserCountStatistics = unknown;

export interface ApifyActorMetricAnalytics {
  month: string;
  actorIds: string[];
  runStatistics: ApifyActorRunStatistics | null;
  userCountStatistics: ApifyActorUserCountStatistics | null;
}

export interface ApifyActorAcquisitionTrafficItem {
  origin: string;
  trafficPercent: number;
}

export interface ApifyActorAcquisition {
  monthStartAt: string;
  actorIds: string[];
  numUniqueViewingUsers: number;
  numUniqueConsolePageViews: number;
  numUniqueUsersWithRun: number;
  topReferrers: ApifyActorAcquisitionTrafficItem[];
  topCountryCodes: ApifyActorAcquisitionTrafficItem[];
}

export interface ApifyActorQualityScores {
  hasInputSchema: number;
  hasOutputSchema: number;
  hasReadme: number;
  actorQuality: number;
  actorQualityPercentile: number;
}

export interface ApifyActorQualityFeedbackItem {
  id?: string;
  title: string;
  description: string;
  percentile?: number;
}

export interface ApifyActorQuality {
  scores: ApifyActorQualityScores | null;
  praises: ApifyActorQualityFeedbackItem[];
  improvements: ApifyActorQualityFeedbackItem[];
}

/**
 * Privacy-preserving summary of the consented user runs exposed by Apify
 * Console. Individual run IDs and user identifiers are deliberately omitted;
 * Console only makes this debugging window available for seven days.
 */
export interface ApifyActorSharedRunSummary {
  total: number;
  sampled: number;
  retentionDays: 7;
  latestFinishedAt: string | null;
  statuses: Record<string, number>;
  dailyRuns: Record<string, number>;
}

export interface ApifyProfitAmounts {
  costUsd: number;
  revenueUsd: number;
  profitUsd: number;
  margin: number;
}

export interface ApifyActorProfitMargin {
  totalProfitMarginStats?: {
    payingUsersUsd?: ApifyProfitAmounts;
    allUsersUsd?: ApifyProfitAmounts;
  };
  dailyProfitMarginStats?: Record<
    string,
    {
      payingUsersUsd?: ApifyProfitAmounts;
      allUsersUsd?: ApifyProfitAmounts;
    }
  >;
}

export interface ApifyActorMonetizationItem {
  actor?: { _id?: string; name?: string; username?: string; title?: string };
  runsStats?: Record<string, number>;
  earningsStats?: {
    totalRevenueUsd?: number;
    totalCostUsd?: number;
    totalProfitUsd?: number;
  };
  usersStats?: { freeUsers?: number; payingUsers?: number };
  chargedResults?: number;
  currentPricingInfo?: ApifyPricingInfo;
}

export interface ApifyActorBreakdown {
  monetizationPerActor?: ApifyActorMonetizationItem[];
  currentMonthProfitUsd?: number;
  previousMonthProfitUsd?: number;
}

export interface ApifyActorRunCosts {
  dailyActorRunsCost?: Record<string, number>;
  totalActorRunsCost?: {
    maxActorRunsCost?: number;
    minActorRunsCost?: number;
    avgActorRunsCost?: number;
  };
}

export interface ApifyActorAnalytics {
  month: string;
  actorIds: string[];
  actorBreakdown: ApifyActorBreakdown;
  costsPerThousandResults: ApifyActorRunCosts;
  runStatistics: ApifyActorRunStatistics;
  userCountStatistics: unknown;
  profitMargin: ApifyActorProfitMargin;
  availability: {
    actorBreakdown: boolean;
    costsPerThousandResults: boolean;
    runStatistics: boolean;
    userCountStatistics: boolean;
    profitMargin: boolean;
  };
  errors: Partial<
    Record<
      | "actorBreakdown"
      | "costsPerThousandResults"
      | "runStatistics"
      | "userCountStatistics"
      | "profitMargin",
      string
    >
  >;
}

export interface ApifyServiceUsage {
  serviceKey?: string;
  quantity: number;
  baseAmountUsd: number;
  baseUnitPriceUsd: number;
  amountAfterVolumeDiscountUsd?: number;
}

export interface ApifyAccountMonthlyUsage {
  usageCycle: {
    startAt: string;
    endAt: string;
  };
  monthlyServiceUsage: Record<string, ApifyServiceUsage>;
  dailyServiceUsages: Array<{
    date: string;
    serviceUsage: Record<string, ApifyServiceUsage>;
    totalUsageCreditsUsd: number;
  }>;
  totalUsageCreditsUsdBeforeVolumeDiscount: number;
  totalUsageCreditsUsdAfterVolumeDiscount: number;
}

export interface ApifyAccountLimits {
  monthlyUsageCycle: {
    startAt: string;
    endAt: string;
  };
  limits: {
    maxMonthlyUsageUsd: number;
    maxMonthlyActorComputeUnits: number;
    maxMonthlyExternalDataTransferGbytes: number;
    maxMonthlyProxySerps: number;
    maxMonthlyResidentialProxyGbytes: number;
    maxActorMemoryGbytes: number;
    maxActorCount: number;
    maxActorTaskCount: number;
    maxConcurrentActorJobs: number;
    maxTeamAccountSeatCount: number;
    dataRetentionDays: number;
    maxScheduleCount?: number;
  };
  current: {
    monthlyUsageUsd: number;
    monthlyActorComputeUnits: number;
    monthlyExternalDataTransferGbytes: number;
    monthlyProxySerps: number;
    monthlyResidentialProxyGbytes: number;
    actorMemoryGbytes: number;
    actorCount: number;
    actorTaskCount: number;
    activeActorJobCount: number;
    teamAccountSeatCount: number;
    scheduleCount?: number;
  };
}

export interface ApifyMonthlyUsage {
  monthStartAt: string;
  monthEndAt: string;
  serviceUsages: Record<string, ApifyServiceUsage>;
}

export type ApifyMonthlyUsages = Record<string, ApifyMonthlyUsage>;

export interface ApifyCalendarMonthUsage {
  dailyServiceUsage: Record<string, ApifyServiceUsage[]>;
  monthlyServiceUsage: Record<string, ApifyServiceUsage>;
}

export type ApifyCurrentServiceBreakdown = Record<string, ApifyServiceUsage[]>;

export interface ApifyActorUsageBreakdownItem {
  actorId: string;
  name: string;
  title: string | null;
  username: string;
  pictureUrl: string | null;
  totalUsageUsd: number;
}

// Phase 4 – Revenue / billing

export interface BillingDailyUsageItem {
  actorId: string;
  actorName: string;
  actorUsername: string;
  date: string; // "2025-01-15"
  amountUsd: number;
  platformFeeUsd?: number;
  netUsd?: number;
  runs: number;
  computeUnits: number;
}
