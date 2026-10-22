export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200, 500] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 500;

export function isPageSizePreset(value: number): boolean {
  return PAGE_SIZE_OPTIONS.includes(value as (typeof PAGE_SIZE_OPTIONS)[number]);
}

export function normalizePageSize(value: string | number | null | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_PAGE_SIZE
    ? parsed
    : DEFAULT_PAGE_SIZE;
}

export function clampPageSize(value: string | number): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || !Number.isFinite(parsed)) return null;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, parsed));
}
