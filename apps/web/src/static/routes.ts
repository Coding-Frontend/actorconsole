export function routeDefinitions<T>(entries: Array<[string, T]>) {
  return entries
    .map(([file, load]) => {
      const parts = file
        .replace("../app/", "")
        .replace("/page.tsx", "")
        .replace(/^page.tsx$/, "")
        .split("/")
        .filter((part) => part && !part.startsWith("("));
      return {
        file,
        load,
        parts,
        score: parts.reduce(
          (score, part) => score + (part.startsWith("[...") ? 1 : part.startsWith("[") ? 3 : 10),
          0,
        ),
      };
    })
    .sort((left, right) => right.score - left.score);
}
export function matchRoute<T>(pathname: string, routes: ReturnType<typeof routeDefinitions<T>>) {
  let values: string[];
  try {
    values = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
  if (values.some((value) => value.includes("/"))) return null;
  for (const route of routes) {
    const params: Record<string, string | string[]> = {};
    let matches = true;
    let cursor = 0;
    for (const part of route.parts) {
      if (part.startsWith("[...")) {
        if (cursor >= values.length) {
          matches = false;
          break;
        }
        params[part.slice(4, -1)] = values.slice(cursor);
        cursor = values.length;
      } else if (part.startsWith("[")) {
        if (!values[cursor]) {
          matches = false;
          break;
        }
        params[part.slice(1, -1)] = values[cursor++];
      } else if (values[cursor++] !== part) {
        matches = false;
        break;
      }
    }
    if (matches && cursor === values.length) return { route, params };
  }
  return null;
}
