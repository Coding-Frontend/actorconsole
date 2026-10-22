import { SERVER_API_BASE_URL } from "@/lib/api-base";
export type ChangelogType = "FEATURE" | "FIX" | "PERF" | "SECURITY" | "UI" | "CHORE";

export interface ChangelogEntryDTO {
  id: string;
  type: ChangelogType;
  text: string;
  sortOrder: number;
}

export interface ChangelogReleaseDTO {
  version: string;
  releaseDate: string;
  summary: string | null;
  entries: ChangelogEntryDTO[];
}

export interface ChangelogPayload {
  releases: ChangelogReleaseDTO[];
}

export type ChangelogCategory = "RELEASE" | "IMPROVEMENT" | "RETIRED";
export interface ChangelogArticle {
  id: string;
  title: string;
  slug: string;
  text: string;
  category: ChangelogCategory;
  type: ChangelogType;
  releaseDate: string;
  version: string;
  sortOrder: number;
  tags: string[];
  body?: string;
}
export interface ChangelogListing {
  items: ChangelogArticle[];
  total: number;
  page: number;
  limit: number;
  year: number;
  years: number[];
  tags: string[];
  months: { month: string; count: number }[];
}

async function fetchChangelog<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API_BASE}/changelog/${path}`, {
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(CHANGELOG_FETCH_TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Changelog API returned ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Failed to fetch changelog");
  return json.data;
}

export async function getChangelogListing(
  params = new URLSearchParams(),
): Promise<ChangelogListing> {
  const data = await fetchChangelog<ChangelogListing>(`entries?${params}`);
  if (!data) throw new Error("Changelog listing unavailable");
  return data;
}

export function getChangelogArticle(slug: string) {
  return fetchChangelog<{ entry: ChangelogArticle; related: ChangelogArticle[] }>(
    `entries/${encodeURIComponent(slug)}`,
  );
}

export async function getChangelogFeed() {
  const data = await fetchChangelog<{ items: ChangelogArticle[] }>("feed");
  if (!data) throw new Error("Changelog feed unavailable");
  return data.items;
}

const API_BASE = SERVER_API_BASE_URL;
const CHANGELOG_FETCH_TIMEOUT_MS = 2_500;

export async function getPublicChangelog(limit = 200): Promise<ChangelogPayload> {
  const res = await fetch(`${API_BASE}/changelog?limit=${limit}`, {
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(CHANGELOG_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Changelog API returned ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Failed to fetch changelog");
  return json.data;
}
