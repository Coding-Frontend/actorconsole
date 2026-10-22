import type { ApifyOrganization, CachedApifyAccount, DetectedApifyAccount } from "./messages";

export const APIFY_ACCOUNT_CACHE_KEY = "cachedApifyAccount";

const accountIdPattern = /^[A-Za-z0-9]{8,64}$/;

function optionalText(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength) : null;
}

function pictureUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function organizationsFrom(value: unknown): ApifyOrganization[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 500).flatMap((item): ApifyOrganization[] => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    if (typeof entry.id !== "string" || !accountIdPattern.test(entry.id) || seen.has(entry.id)) return [];
    seen.add(entry.id);
    return [{
      id: entry.id,
      name: optionalText(entry.name, 160) ?? `Organization ${entry.id}`,
      username: optionalText(entry.username, 100),
      pictureUrl: pictureUrl(entry.pictureUrl),
    }];
  });
}

export function parseCachedApifyAccount(value: unknown): CachedApifyAccount | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.userId !== "string" || !accountIdPattern.test(entry.userId)) return null;
  const cachedAt = typeof entry.cachedAt === "string" ? Date.parse(entry.cachedAt) : NaN;
  const observedAt = typeof entry.observedAt === "string" ? Date.parse(entry.observedAt) : NaN;
  if (!Number.isFinite(cachedAt) || !Number.isFinite(observedAt)) return null;
  const organizations = organizationsFrom(entry.organizations)
    .filter((organization) => organization.id !== entry.userId);
  const selectedAccountId = typeof entry.selectedAccountId === "string" &&
    (entry.selectedAccountId === entry.userId || organizations.some((item) => item.id === entry.selectedAccountId))
    ? entry.selectedAccountId : entry.userId;
  return {
    userId: entry.userId,
    username: optionalText(entry.username, 100),
    displayName: optionalText(entry.displayName, 160),
    pictureUrl: pictureUrl(entry.pictureUrl),
    observedAt: new Date(observedAt).toISOString(),
    selectedAccountId,
    organizations,
    cachedAt: new Date(cachedAt).toISOString(),
  };
}

export function cacheApifyAccount(
  account: DetectedApifyAccount,
  previous: CachedApifyAccount | null,
): CachedApifyAccount {
  const sameUser = previous?.userId === account.userId;
  const organizations = account.organizationsStatus === "ready"
    ? account.organizations
    : account.organizationsStatus === "limited"
      ? [...account.organizations, ...(sameUser ? previous.organizations : [])]
      : sameUser ? previous.organizations : account.organizations;
  const selectedAccountId = account.organizationsStatus === "loading" || account.organizationsStatus === "unavailable"
    ? account.selectionManual || !sameUser ? account.selectedAccountId : previous.selectedAccountId
    : account.selectedAccountId;
  const normalized = parseCachedApifyAccount({
    userId: account.userId,
    username: account.username ?? (sameUser ? previous.username : null),
    displayName: account.displayName ?? (sameUser ? previous.displayName : null),
    pictureUrl: account.pictureUrl ?? (sameUser ? previous.pictureUrl : null),
    observedAt: account.observedAt,
    selectedAccountId,
    organizations,
    cachedAt: new Date().toISOString(),
  });
  if (!normalized) throw new Error("Could not cache the Apify account details.");
  return normalized;
}
