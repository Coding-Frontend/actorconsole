import "server-only";
import { getLogger } from "@actorconsole/shared";

import {
  BUILDER_WINDOWS,
  getBuilderActorDetail,
  getBuildersForComparison,
  getBuilderComparisonHistory,
  searchActorsForComparison,
  searchBuildersForComparison,
  type BuilderWindow,
  type BuilderProfile,
} from "@/lib/builders";
import {
  actorCompareItem,
  builderCompareItem,
  type PublicCompareItem,
  type PublicCompareKind,
} from "@/components/comparison/public-comparison-items";

export function parseComparisonWindow(value: string | null | undefined): BuilderWindow {
  const parsed = Number.parseInt(value ?? "30", 10);
  return BUILDER_WINDOWS.includes(parsed as BuilderWindow) ? (parsed as BuilderWindow) : 30;
}

export function parseComparisonIds(value: string | string[] | null | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.filter((item) => item.length > 0 && item.length <= 200))].slice(0, 5);
}

export async function loadPublicComparison(
  kind: PublicCompareKind,
  ids: string[],
  window: BuilderWindow,
): Promise<{ items: PublicCompareItem[]; missing: number }> {
  const requested = parseComparisonIds(ids);
  const historyPromise =
    kind === "builder"
      ? getBuilderComparisonHistory(
          requested.filter((id) => /^[\w.-]{1,100}$/.test(id)),
          window,
        ).catch((error) => {
          getLogger("web:comparison").error({ error }, "Could not load comparison history");
          return new Map<string, BuilderProfile["trendChart"]>();
        })
      : null;
  const resolved =
    kind === "builder"
      ? (
          await getBuildersForComparison(
            requested.filter((id) => /^[\w.-]{1,100}$/.test(id)),
            window,
          )
        ).map((builder) => builderCompareItem(builder, window))
      : await Promise.all(
          requested.map(async (id): Promise<PublicCompareItem | null> => {
            const slash = id.indexOf("/");
            if (slash < 1) return null;
            const username = id.slice(0, slash);
            const actorName = id.slice(slash + 1);
            if (!/^[\w.-]{1,100}$/.test(username) || !/^[\w.-]{1,100}$/.test(actorName))
              return null;
            const actor = await getBuilderActorDetail(username, actorName, window);
            return actor && actor.isAvailable !== false
              ? actorCompareItem(username, actor, window)
              : null;
          }),
        );
  const items = resolved.filter((item): item is PublicCompareItem => item !== null);
  const history = await historyPromise;
  if (history)
    for (const item of items) {
      item.history = history.get(item.username)?.map((point) => ({
        date: point.date,
        users: point.observed ? point.users : null,
        runs: point.observed ? point.runs : null,
        usersCoverage: point.usersCoverage,
        runsCoverage: point.runsCoverage,
      }));
    }
  return { items, missing: requested.length - items.length };
}

export async function searchPublicComparison(
  kind: PublicCompareKind,
  query: string,
  window: BuilderWindow,
) {
  if (kind === "builder") {
    const builders = await searchBuildersForComparison(query, window);
    return builders.map((builder) => builderCompareItem(builder, window));
  }
  const actors = await searchActorsForComparison(query, window);
  return actors.map(({ username, actor }) => actorCompareItem(username, actor, window));
}
