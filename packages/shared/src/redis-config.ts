/** Read once at startup in each process; API and worker must use the same mode. */
export function isRedisEnabled(
  env: { NODE_ENV?: string; REDIS_ENABLED?: string; REDIS_URL?: string } = process.env,
): boolean {
  const flag = env.REDIS_ENABLED?.trim().toLowerCase();
  if (flag !== undefined && flag !== "" && flag !== "true" && flag !== "false") {
    throw new Error("REDIS_ENABLED must be true or false");
  }
  // Preserve existing installations that configured REDIS_URL before this flag existed.
  // Production must opt out explicitly, so losing a URL cannot silently hide
  // the existing Redis backlog behind an empty database queue.
  const enabled = flag === "true" || (!flag && (env.NODE_ENV === "production" || Boolean(env.REDIS_URL)));
  if (enabled && !env.REDIS_URL?.trim()) {
    throw new Error("REDIS_URL is required when REDIS_ENABLED=true");
  }
  return enabled;
}
