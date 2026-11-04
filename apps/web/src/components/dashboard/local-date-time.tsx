"use client";

import { useEffect, useState } from "react";

/** Deterministic UTC first render, followed by the browser's local time. */
export function LocalDateTime({ value }: { value: string }) {
  const [local, setLocal] = useState<{ value: string; text: string } | null>(null);
  useEffect(() => {
    const date = new Date(value);
    if (Number.isFinite(date.getTime()))
      setLocal({
        value,
        text: date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
      });
  }, [value]);
  const fallback = Number.isFinite(Date.parse(value))
    ? `${new Date(value).toISOString().slice(0, 16).replace("T", " ")} UTC`
    : "Date unavailable";
  return <time dateTime={value}>{local?.value === value ? local.text : fallback}</time>;
}
