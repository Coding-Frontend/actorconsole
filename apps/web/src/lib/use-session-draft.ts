"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60_000;

/** Per-tab drafts are scoped by the caller to the account and workspace/entity. */
export function useSessionDraft<T>(
  key: string | null,
  initial: T,
  validate: (value: unknown) => value is T,
) {
  const initialValue = useRef(initial);
  initialValue.current = initial;
  const activeKey = useRef(key);
  activeKey.current = key;
  const currentValue = useRef(initial);
  const [entry, setEntry] = useState<{
    key: string | null;
    value: T;
    ready: boolean;
    restored: boolean;
  }>({ key: null, value: initial, ready: false, restored: false });
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    if (!key) return;
    let value = initialValue.current,
      restored = false;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw) {
        const saved = raw.length <= 30_000 ? JSON.parse(raw) : null;
        if (
          saved?.version === 1 &&
          typeof saved.updatedAt === "number" &&
          Date.now() - saved.updatedAt < MAX_DRAFT_AGE_MS &&
          validate(saved.value)
        ) {
          value = saved.value;
          restored = true;
        } else window.sessionStorage.removeItem(key);
      }
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
    currentValue.current = value;
    setEntry({ key, value, ready: true, restored });
  }, [key, validate]);

  const setValue = useCallback(
    (next: T | ((previous: T) => T)) => {
      if (!key || activeKey.current !== key) return;
      const value =
        typeof next === "function" ? (next as (previous: T) => T)(currentValue.current) : next;
      currentValue.current = value;
      try {
        window.sessionStorage.setItem(
          key,
          JSON.stringify({ version: 1, updatedAt: Date.now(), value }),
        );
        setStorageAvailable(true);
      } catch {
        setStorageAvailable(false);
      }
      setEntry((previous) => ({
        key,
        value,
        ready: true,
        restored: previous.key === key && previous.restored,
      }));
    },
    [key],
  );

  const clear = useCallback(() => {
    if (key) {
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        setStorageAvailable(false);
      }
    }
    if (activeKey.current !== key) return;
    currentValue.current = initialValue.current;
    setEntry({ key, value: initialValue.current, ready: Boolean(key), restored: false });
  }, [key]);
  const ready = entry.key === key && entry.ready;
  const value = ready ? entry.value : initial;
  const dirty = ready && JSON.stringify(value) !== JSON.stringify(initial);
  useEffect(() => {
    if (storageAvailable || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, storageAvailable]);
  return {
    value,
    setValue,
    clear,
    ready,
    dirty,
    restored: ready && entry.restored,
    storageAvailable,
  };
}
