import type { BuilderWindow } from "@/lib/builders";

export type ComparisonKind = "builder" | "actor";

const slugPattern = /^[\w.-]{1,100}$/;

export function comparisonPath(kind: ComparisonKind, ids: string[]) {
  const base = kind === "actor" ? "/actors/compare" : "/builders/compare";
  const selected = ids
    .filter((id) => {
      if (kind === "builder") return slugPattern.test(id);
      const parts = id.split("/");
      return parts.length === 2 && parts.every((part) => slugPattern.test(part));
    })
    .slice(0, 5);
  if (!selected.length) return base;
  if (kind === "builder") return `${base}/${selected.map(encodeURIComponent).join("/")}`;

  const segments = selected.flatMap((id, index) => {
    const [username, actorName] = id.split("/");
    return [`${index ? "~" : ""}${encodeURIComponent(username)}`, encodeURIComponent(actorName)];
  });
  return `${base}/${segments.join("/")}`;
}

export function publicComparisonHref(
  kind: ComparisonKind,
  ids: string[],
  window: BuilderWindow = 30,
) {
  const path = comparisonPath(kind, ids);
  return window === 30 ? path : `${path}?window=${window}`;
}

export function dashboardActorComparisonHref(ids: string[], keyword = "") {
  const path = comparisonPath("actor", ids).replace(
    "/actors/compare",
    "/dashboard/keywords/compare",
  );
  const q = keyword.trim();
  return q ? `${path}?q=${encodeURIComponent(q)}` : path;
}

export function parseComparisonPath(kind: ComparisonKind, segments: string[]): string[] | null {
  if (kind === "builder") {
    if (segments.length > 5 || segments.some((segment) => !slugPattern.test(segment))) return null;
    return [...new Set(segments)];
  }
  if (segments.length % 2 || segments.length > 10) return null;
  const ids: string[] = [];
  for (let index = 0; index < segments.length; index += 2) {
    const owner = index ? segments[index].replace(/^~/, "") : segments[index];
    const actor = segments[index + 1];
    if (
      (index > 0 && !segments[index].startsWith("~")) ||
      !slugPattern.test(owner) ||
      !slugPattern.test(actor)
    )
      return null;
    ids.push(`${owner}/${actor}`);
  }
  return [...new Set(ids)];
}
