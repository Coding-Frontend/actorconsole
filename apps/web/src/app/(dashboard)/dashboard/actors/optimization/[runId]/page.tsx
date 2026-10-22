import { ActorOptimizationReview } from "@/components/dashboard/actor-optimization-review";

export default async function ActorOptimizationReviewPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return <ActorOptimizationReview runId={runId} />;
}
