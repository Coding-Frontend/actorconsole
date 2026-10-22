/** The profile view and its metadata must share one anonymous public read. */
export function canonicalCatalogArgs(operation, args) {
  if (
    operation !== "profile" ||
    args.length !== 2 ||
    !args[1] ||
    typeof args[1] !== "object" ||
    Array.isArray(args[1])
  )
    return args;
  const options = Object.fromEntries(
    Object.entries(args[1]).filter(([, value]) => value !== undefined),
  );
  return [args[0], { window: 30, actorPage: 1, actorSort: "active-users", ...options }];
}
