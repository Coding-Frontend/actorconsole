"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { accountRequest } from "./account-api";

/** Keep loaded values mounted, but never expose an editable empty fallback. */
export function useAccountResource<T>(path: string, validate: (value: unknown) => value is T) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      request.abort();
    }, 35_000);
    setLoading(true);
    setError(null);
    try {
      const result = await accountRequest<unknown>(path, { signal: request.signal });
      if (!validate(result))
        throw new Error("The saved values could not be read. Please try again.");
      if (!request.signal.aborted) setData(result);
    } catch (failure) {
      if (!request.signal.aborted || timedOut)
        setError(
          timedOut
            ? "Loading took too long. Please try again."
            : failure instanceof Error
              ? failure.message
              : "The saved values could not be loaded.",
        );
    } finally {
      window.clearTimeout(timer);
      if (!request.signal.aborted || timedOut) setLoading(false);
    }
  }, [path, validate]);
  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [load]);
  return { data, setData, loading, error, retry: load };
}
