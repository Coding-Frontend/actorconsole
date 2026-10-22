/** Preserve Dates and Maps in catalog responses without importing a database client. */
export function encodeApiData(value: unknown): unknown {
  if (value instanceof Date) return { $actorconsole: "date", value: value.toISOString() };
  if (value instanceof Map)
    return { $actorconsole: "map", value: [...value].map(([key, item]) => [key, encodeApiData(item)]) };
  if (Array.isArray(value)) return value.map(encodeApiData);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeApiData(item)]));
  return value;
}

export function decodeApiData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeApiData);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.$actorconsole === "date" && typeof record.value === "string")
      return new Date(record.value);
    if (record.$actorconsole === "map" && Array.isArray(record.value))
      return new Map(record.value.map(([key, item]: [string, unknown]) => [key, decodeApiData(item)]));
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, decodeApiData(item)]));
  }
  return value;
}
