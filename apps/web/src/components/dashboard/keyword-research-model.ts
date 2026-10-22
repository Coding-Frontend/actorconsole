export interface KeywordResult {
  id: string;
  username: string;
  name: string;
  title?: string | null;
  description?: string | null;
  pictureUrl?: string | null;
  totalRuns?: number | null;
  usersTotal?: number | null;
  monthlyUsers?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  bookmarkCount?: number | null;
  difficultyScore?: number;
  opportunityScore?: number;
  historyPoints?: number;
  demandTrendPercent?: number | null;
}

export type KeywordSort = "relevance" | "opportunity" | "monthlyUsers" | "totalRuns";

export function actorKey(actor: Pick<KeywordResult, "username" | "name">) {
  return `${actor.username.toLowerCase()}/${actor.name.toLowerCase()}`;
}

export function filterKeywordResults(
  results: KeywordResult[],
  options: {
    sort: KeywordSort;
    minOpportunity: number;
    hideTracked: boolean;
    trackedKeys: Set<string>;
  },
) {
  const filtered = results.filter(
    (result) =>
      (result.opportunityScore ?? 0) >= options.minOpportunity &&
      (!options.hideTracked || !options.trackedKeys.has(actorKey(result))),
  );
  if (options.sort === "relevance") return filtered;
  const sortKey = options.sort === "opportunity" ? "opportunityScore" : options.sort;
  return filtered.sort((left, right) => {
    const difference = (right[sortKey] ?? -1) - (left[sortKey] ?? -1);
    return difference || results.indexOf(left) - results.indexOf(right);
  });
}

export function keywordFunnel(results: KeywordResult[], trackedKeys: Set<string>) {
  const withDemand = results.filter((result) => (result.monthlyUsers ?? 0) > 0);
  const opportunities = withDemand.filter((result) => (result.opportunityScore ?? 0) >= 60);
  return [
    { label: "Store results", count: results.length, detail: "Top listings returned" },
    { label: "Demand observed", count: withDemand.length, detail: "30-day users available" },
    { label: "Opportunity", count: opportunities.length, detail: "Score of 60 or higher" },
    {
      label: "In workspace",
      count: opportunities.filter((result) => trackedKeys.has(actorKey(result))).length,
      detail: "Shortlisted and tracked",
    },
  ];
}
