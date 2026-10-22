import { describe, expect, it } from "vitest";
import { analyzeActorPublishReadiness, classifyPublishingFailure } from "./actor-publish-readiness";

describe("analyzeActorPublishReadiness", () => {
  it("keeps failed default-build reads unknown instead of labeling artifacts missing or ready", () => {
    const readiness = analyzeActorPublishReadiness({
      description: "Actor",
      artifactChecks: {
        readme: null,
        inputSchema: null,
        outputSchema: null,
        keyValueStoreSchema: null,
      },
    });
    expect(readiness.publishReady).toBeNull();
    expect(readiness.missing).toEqual([]);
    expect(readiness.blocking).toEqual([]);
  });
  it("checks available Actor metadata without reading source files", () => {
    const readiness = analyzeActorPublishReadiness({
      description: "Extracts public records.",
      readme: "# Records Actor",
      inputSchema: {},
      outputSchema: {},
    });

    expect(readiness.publishReady).toBe(true);
    expect(readiness.checks).toEqual({
      description: true,
      readme: true,
      inputSchema: true,
      outputSchema: true,
      keyValueStoreSchema: null,
      taggedBuild: null,
      publicProfile: null,
      verifiedEmail: null,
      nonDisposableEmail: null,
    });
  });

  it("blocks publication when the default build is missing required input or output schemas", () => {
    const readiness = analyzeActorPublishReadiness({
      description: "Extracts public records.",
      readme: "# Records Actor",
    });

    expect(readiness.publishReady).toBe(false);
    expect(readiness.missing).toEqual(["inputSchema", "outputSchema"]);
    expect(readiness.blocking).toEqual(["inputSchema", "outputSchema"]);
  });

  it("marks unavailable metadata as missing without inspecting source", () => {
    const readiness = analyzeActorPublishReadiness({
      description: "Description",
    });

    expect(readiness.checks).toMatchObject({
      readme: false,
      inputSchema: false,
      outputSchema: false,
      keyValueStoreSchema: null,
    });
    expect(readiness.publishReady).toBe(false);
  });

  it("blocks known Console publication gates while leaving unavailable account checks unknown", () => {
    const readiness = analyzeActorPublishReadiness({
      readme: "# Actor",
      inputSchema: {},
      outputSchema: {},
      taggedBuilds: {},
      publicProfile: false,
    });

    expect(readiness.checks).toMatchObject({
      taggedBuild: false,
      publicProfile: false,
      verifiedEmail: null,
      nonDisposableEmail: null,
    });
    expect(readiness.blocking).toEqual(["taggedBuild", "publicProfile"]);
    expect(readiness.publishReady).toBe(false);
  });
});

describe("classifyPublishingFailure", () => {
  it.each([
    [
      "This Actor cannot be published because its default build has no README file",
      "MISSING_README",
    ],
    [
      "This Actor can't be published because its default build has no input or output schema.",
      "MISSING_INPUT_SCHEMA",
    ],
    [
      "This Actor can't be published because its default build has no output schema.",
      "MISSING_OUTPUT_SCHEMA",
    ],
    ["tagged-build-required", "MISSING_TAGGED_BUILD"],
    ["A public profile is required before publishing", "PUBLIC_PROFILE_REQUIRED"],
    ["user-email-not-verified", "EMAIL_NOT_VERIFIED"],
    ["user-email-is-disposable", "DISPOSABLE_EMAIL"],
    ["store-terms-not-accepted", "STORE_TERMS_REQUIRED"],
    ["full-permission-actor-not-approved", "ACTOR_PERMISSION_APPROVAL_REQUIRED"],
  ])("marks permanent validation failures as blocked", (message, code) => {
    expect(classifyPublishingFailure(new Error(message))).toEqual({ retryable: false, code });
  });

  it("keeps network and rate-limit failures retryable", () => {
    expect(classifyPublishingFailure(new Error("HTTP 429: Too Many Requests"))).toEqual({
      retryable: true,
      code: "TRANSIENT_PUBLISHING_FAILURE",
    });
  });

  it("does not mislabel Apify's generic publication response as metadata-invalid", () => {
    expect(
      classifyPublishingFailure(
        new Error(
          "The Actor cannot be published at this time. Please contact support@apify.com for assistance in resolving the issue.",
        ),
      ),
    ).toEqual({ retryable: true, code: "TRANSIENT_PUBLISHING_FAILURE" });
  });

  it("blocks a failed validation run with an actionable code", () => {
    expect(
      classifyPublishingFailure(
        new Error(
          "Actor validation run run-1 finished with status FAILED; the Actor must complete a successful run before publishing.",
        ),
      ),
    ).toEqual({ retryable: false, code: "ACTOR_RUN_FAILED" });
  });
});
