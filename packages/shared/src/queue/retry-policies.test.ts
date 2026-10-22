import { describe, expect, it } from "vitest";
import { QUEUE_RETRY_POLICIES, retryPolicyFor } from "./retry-policies.js";

describe("QUEUE_RETRY_POLICIES", () => {
  it("covers all expected queues", () => {
    expect(Object.keys(QUEUE_RETRY_POLICIES).sort()).toEqual(
      ["audience", "catalog", "newsletter", "optimization", "schedules", "snapshots"].sort(),
    );
  });

  it("every policy has attempts, exponential backoff, and removeOn* counts", () => {
    for (const [name, policy] of Object.entries(QUEUE_RETRY_POLICIES)) {
      expect(policy.attempts, `${name} attempts`).toBeGreaterThanOrEqual(1);
      expect(policy.backoff, `${name} backoff`).toBeDefined();
      expect(policy.backoff?.type, `${name} backoff.type`).toBe("exponential");
      expect(policy.backoff?.delay, `${name} backoff.delay`).toBeGreaterThanOrEqual(1_000);
      expect(policy.removeOnComplete, `${name} removeOnComplete`).toBeDefined();
      expect(policy.removeOnFail, `${name} removeOnFail`).toBeDefined();
    }
  });

  it("schedules have 3 attempts (transient-tolerant)", () => {
    expect(QUEUE_RETRY_POLICIES.schedules.attempts).toBe(3);
  });

  it("snapshots has a longer backoff (30s base) to protect rate-limited APIs", () => {
    expect(QUEUE_RETRY_POLICIES.snapshots.backoff?.delay).toBe(30_000);
    expect(QUEUE_RETRY_POLICIES.catalog.backoff?.delay).toBe(30_000);
  });

  it("snapshots have only 2 attempts (manual intervention expected)", () => {
    expect(QUEUE_RETRY_POLICIES.snapshots.attempts).toBe(2);
  });
});

describe("retryPolicyFor", () => {
  it("returns the policy for a known queue", () => {
    expect(retryPolicyFor("schedules")).toEqual(QUEUE_RETRY_POLICIES.schedules);
  });

  it("returns undefined for an unknown queue", () => {
    expect(retryPolicyFor("does-not-exist")).toBeUndefined();
  });
});
