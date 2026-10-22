import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "./safe-callback-url";

describe("safeCallbackUrl", () => {
  it("keeps local application paths", () => {
    expect(safeCallbackUrl("/dashboard/actors?tab=history")).toBe("/dashboard/actors?tab=history");
  });

  it.each(["https://example.com", "//example.com", "/\\example.com", "/login?callbackUrl=/login"])(
    "rejects unsafe or looping destination %s",
    (value) => expect(safeCallbackUrl(value)).toBe("/dashboard"),
  );
});
