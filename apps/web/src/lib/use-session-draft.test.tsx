import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSessionDraft } from "./use-session-draft";
const initial = { text: "" };
const valid = (value: unknown): value is typeof initial =>
  Boolean(value && typeof value === "object" && typeof (value as typeof initial).text === "string");
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});
describe("scoped support drafts", () => {
  it("restores across remounts and separates workspaces and users, even when an old request finishes", () => {
    const first = renderHook(({ scope }) => useSessionDraft(scope, initial, valid), {
      initialProps: { scope: "user-one:workspace-one" },
    });
    act(() => first.result.current.setValue({ text: "Workspace one draft" }));
    const clearOld = first.result.current.clear;
    first.rerender({ scope: "user-one:workspace-two" });
    expect(first.result.current.value.text).toBe("");
    act(() => first.result.current.setValue({ text: "Workspace two draft" }));
    act(() => clearOld());
    expect(first.result.current.value.text).toBe("Workspace two draft");
    first.unmount();
    const second = renderHook(() => useSessionDraft("user-one:workspace-two", initial, valid));
    expect(second.result.current.value.text).toBe("Workspace two draft");
    expect(second.result.current.restored).toBe(true);
    const other = renderHook(() => useSessionDraft("user-two:workspace-two", initial, valid));
    expect(other.result.current.value.text).toBe("");
    act(() => second.result.current.clear());
    expect(window.sessionStorage.getItem("user-one:workspace-two")).toBeNull();
  });
  it("rejects expired or malformed drafts and reports storage failure while preserving typing", () => {
    window.sessionStorage.setItem(
      "expired",
      JSON.stringify({ version: 1, updatedAt: 0, value: { text: "old" } }),
    );
    const expired = renderHook(() => useSessionDraft("expired", initial, valid));
    expect(expired.result.current.value.text).toBe("");
    window.sessionStorage.setItem(
      "invalid",
      JSON.stringify({ version: 1, updatedAt: Date.now(), value: { text: 42 } }),
    );
    const invalid = renderHook(() => useSessionDraft("invalid", initial, valid));
    expect(invalid.result.current.value.text).toBe("");
    vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Storage blocked");
    });
    act(() => invalid.result.current.setValue({ text: "Keep my text" }));
    expect(invalid.result.current.value.text).toBe("Keep my text");
    expect(invalid.result.current.storageAvailable).toBe(false);
  });
});
