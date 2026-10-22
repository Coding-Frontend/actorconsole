import type { ApifyActorBuildArtifacts, ApifyActorSummary } from "@actorconsole/apify";
import { analyzeActorPublishReadiness, type ActorPublishReadiness } from "@actorconsole/shared";

export async function loadActorPublishReadiness(
  apify: { getActorDefaultBuildArtifacts(id: string): Promise<ApifyActorBuildArtifacts> },
  actor: ApifyActorSummary,
  accountChecks: {
    taggedBuild?: boolean | null;
    publicProfile?: boolean | null;
    verifiedEmail?: boolean | null;
    nonDisposableEmail?: boolean | null;
  } = {},
): Promise<ActorPublishReadiness> {
  // Let callers handle failed reads. A permission/network failure is not evidence
  // that the default build lacks artifacts.
  const artifacts = await apify.getActorDefaultBuildArtifacts(actor.id);
  return analyzeActorPublishReadiness({
    ...actor,
    ...accountChecks,
    artifactChecks: {
      readme: Boolean(artifacts.readme?.trim()),
      inputSchema: artifacts.inputSchema !== null,
      outputSchema: artifacts.outputSchema !== null,
      // Optional: absence is not a publication problem.
      keyValueStoreSchema: artifacts.keyValueStoreSchema !== null ? true : null,
    },
  });
}

export function actorReadinessData(readiness: ActorPublishReadiness) {
  return {
    publishReady: readiness.publishReady,
    hasDescription: readiness.checks.description,
    hasReadme: readiness.checks.readme,
    hasInputSchema: readiness.checks.inputSchema,
    hasOutputSchema: readiness.checks.outputSchema,
    hasKeyValueSchema: readiness.checks.keyValueStoreSchema,
    ...(readiness.checks.taggedBuild === null
      ? {}
      : { hasTaggedBuild: readiness.checks.taggedBuild }),
    ...(readiness.checks.publicProfile === null
      ? {}
      : { hasPublicProfile: readiness.checks.publicProfile }),
    ...(readiness.checks.verifiedEmail === null
      ? {}
      : { hasVerifiedEmail: readiness.checks.verifiedEmail }),
    ...(readiness.checks.nonDisposableEmail === null
      ? {}
      : { hasNonDisposableEmail: readiness.checks.nonDisposableEmail }),
    readinessSyncedAt: new Date(readiness.checkedAt),
  };
}
