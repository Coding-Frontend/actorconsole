import { describe, expect, it, vi } from "vitest";
import { actorReadinessData, loadActorPublishReadiness } from "../../src/lib/publish-readiness";

describe("default build publishing readiness", () => {
  const actor = {
    id: "actor-1",
    username: "owner",
    name: "actor",
    title: "Actor",
    description: "Actor description",
    pictureUrl: null,
    isPublic: true,
    url: "https://apify.com/owner/actor",
  };
  const artifacts = {
    readme: "# Actor",
    inputSchema: {},
    outputSchema: {},
    keyValueStoreSchema: null,
  };

  it("refreshes stale missing flags using build artifacts even when list metadata lacks them", async () => {
    const apify = { getActorDefaultBuildArtifacts: vi.fn().mockResolvedValue(artifacts) };
    const readiness = await loadActorPublishReadiness(apify, actor);
    const stale = {
      hasReadme: false,
      hasInputSchema: false,
      hasOutputSchema: false,
      publishReady: false,
    };
    expect({ ...stale, ...actorReadinessData(readiness) }).toMatchObject({
      hasReadme: true,
      hasInputSchema: true,
      hasOutputSchema: true,
      publishReady: true,
      hasKeyValueSchema: null,
      readinessSyncedAt: expect.any(Date),
    });
    expect(apify.getActorDefaultBuildArtifacts).toHaveBeenCalledWith("actor-1");
  });

  it("retains real publication blockers and does not require optional storage schemas", async () => {
    const apify = { getActorDefaultBuildArtifacts: vi.fn().mockResolvedValue(artifacts) };
    const readiness = await loadActorPublishReadiness(apify, actor, {
      taggedBuild: false,
      publicProfile: false,
    });
    expect(readiness.blocking).toEqual(["taggedBuild", "publicProfile"]);
    expect(readiness.publishReady).toBe(false);
  });

  it("blocks artifacts absent from the default build even if another metadata response contains them", async () => {
    const apify = {
      getActorDefaultBuildArtifacts: vi
        .fn()
        .mockResolvedValue({ ...artifacts, outputSchema: null }),
    };
    const readiness = await loadActorPublishReadiness(apify, {
      ...actor,
      outputSchema: {},
    } as typeof actor);
    expect(readiness.blocking).toEqual(["outputSchema"]);
  });

  it("propagates an unavailable build read so callers cannot save false missing flags", async () => {
    const apify = {
      getActorDefaultBuildArtifacts: vi.fn().mockRejectedValue(new Error("HTTP 403")),
    };
    await expect(loadActorPublishReadiness(apify, actor)).rejects.toThrow("HTTP 403");
  });
});
