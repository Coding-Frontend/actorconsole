export const ACTOR_READINESS_CHECKS = [
  "description",
  "readme",
  "inputSchema",
  "outputSchema",
  "keyValueStoreSchema",
  "taggedBuild",
  "publicProfile",
  "verifiedEmail",
  "nonDisposableEmail",
] as const;

export type ActorReadinessCheck = (typeof ACTOR_READINESS_CHECKS)[number];

export type ActorPublishReadiness = {
  publishReady: boolean | null;
  checkedAt: string;
  checks: Record<ActorReadinessCheck, boolean | null>;
  missing: ActorReadinessCheck[];
  blocking: ActorReadinessCheck[];
};

type ActorPublishReadinessInput = {
  description?: string | null;
  readme?: string | null;
  inputSchema?: unknown;
  outputSchema?: unknown;
  artifactChecks?: Record<
    "readme" | "inputSchema" | "outputSchema" | "keyValueStoreSchema",
    boolean | null
  >;
  taggedBuilds?: Record<string, unknown> | null;
  taggedBuild?: boolean | null;
  publicProfile?: boolean | null;
  verifiedEmail?: boolean | null;
  nonDisposableEmail?: boolean | null;
  checkedAt?: Date;
};

function hasObject(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * Inspect available Actor metadata before publication. Apify performs final
 * validation against its own build when an Actor is published.
 */
export function analyzeActorPublishReadiness(
  input: ActorPublishReadinessInput,
): ActorPublishReadiness {
  const checks: Record<ActorReadinessCheck, boolean | null> = {
    description: Boolean(input.description?.trim()),
    readme: Boolean(input.readme?.trim()),
    inputSchema: hasObject(input.inputSchema),
    outputSchema: hasObject(input.outputSchema),
    keyValueStoreSchema: null,
    taggedBuild:
      input.taggedBuild ??
      (input.taggedBuilds === undefined
        ? null
        : Object.values(input.taggedBuilds ?? {}).some((build) => {
            if (!build || typeof build !== "object" || Array.isArray(build)) return false;
            const record = build as Record<string, unknown>;
            return Boolean(record.buildId || record.buildNumber);
          })),
    publicProfile: input.publicProfile ?? null,
    verifiedEmail: input.verifiedEmail ?? null,
    nonDisposableEmail: input.nonDisposableEmail ?? null,
    ...input.artifactChecks,
  };
  const missing = ACTOR_READINESS_CHECKS.filter((check) => checks[check] === false);
  // Apify validates these artifacts on the default build before publication.
  // A key-value store schema remains optional because many Actors never write
  // named key-value records.
  const blocking = (
    [
      "readme",
      "inputSchema",
      "outputSchema",
      "taggedBuild",
      "publicProfile",
      "verifiedEmail",
      "nonDisposableEmail",
    ] as const
  ).filter((check) => checks[check] === false);
  return {
    publishReady:
      blocking.length > 0
        ? false
        : [checks.readme, checks.inputSchema, checks.outputSchema].includes(null)
          ? null
          : true,
    checkedAt: (input.checkedAt ?? new Date()).toISOString(),
    checks,
    missing,
    blocking,
  };
}

export type PublishingFailureClassification = {
  retryable: boolean;
  code: string;
};

/** Classify Apify publication failures so invalid Actors do not block every day. */
export function classifyPublishingFailure(error: unknown): PublishingFailureClassification {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (/tagged-build-required|tagged build.*(?:required|missing)|no tagged build/i.test(message)) {
    return { retryable: false, code: "MISSING_TAGGED_BUILD" };
  }
  if (
    /public profile.*(?:required|missing)|public account.*publish|cannot-publish-profile|cannot unpublish profile/i.test(
      message,
    )
  ) {
    return { retryable: false, code: "PUBLIC_PROFILE_REQUIRED" };
  }
  if (/user-email-not-verified|email.*not verified|verify.*email/i.test(message)) {
    return { retryable: false, code: "EMAIL_NOT_VERIFIED" };
  }
  if (/user-email-is-disposable|disposable email|temporary email/i.test(message)) {
    return { retryable: false, code: "DISPOSABLE_EMAIL" };
  }
  if (/store-terms-not-accepted|accept.*store terms/i.test(message)) {
    return { retryable: false, code: "STORE_TERMS_REQUIRED" };
  }
  if (/full-permission-actor-not-approved|permissions? approval.*required/i.test(message)) {
    return { retryable: false, code: "ACTOR_PERMISSION_APPROVAL_REQUIRED" };
  }
  if (
    /actor validation run .* finished with status|actor must complete a successful run before publishing|successful run.*before publishing/i.test(
      message,
    )
  ) {
    return { retryable: false, code: "ACTOR_RUN_FAILED" };
  }
  if (
    /default build.*(?:no|missing).*readme|readme.*(?:required|missing|not found)/i.test(message)
  ) {
    return { retryable: false, code: "MISSING_README" };
  }
  if (
    /default build.*(?:no|missing).*(?:input.*schema|schema.*input)|input schema.*(?:required|missing|not found)/i.test(
      message,
    )
  ) {
    return { retryable: false, code: "MISSING_INPUT_SCHEMA" };
  }
  if (
    /default build.*(?:no|missing).*(?:output.*schema|schema.*output)|output schema.*(?:required|missing|not found)/i.test(
      message,
    )
  ) {
    return { retryable: false, code: "MISSING_OUTPUT_SCHEMA" };
  }
  if (/invalid value provided.*(?:updated )?actor/i.test(message)) {
    return { retryable: false, code: "INVALID_ACTOR_METADATA" };
  }
  return { retryable: true, code: "TRANSIENT_PUBLISHING_FAILURE" };
}
