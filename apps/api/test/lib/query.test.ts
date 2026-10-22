import { describe, expect, it } from "vitest";
import {
  booleanQuery,
  dateQuery,
  enumQuery,
  integerQuery,
  limitQuery,
  stringQuery,
} from "../../src/lib/query.js";

describe("query parsing", () => {
  it("parses bounded integers", () => {
    expect(integerQuery("7", { name: "days", defaultValue: 30, min: 1, max: 90 })).toBe(7);
    expect(integerQuery(undefined, { name: "days", defaultValue: 30, max: 90 })).toBe(30);
    expect(() =>
      integerQuery("91", { name: "days", defaultValue: 30, min: 1, max: 90 }),
    ).toThrow("days must be between 1 and 90");
  });

  it("clamps valid limits and rejects malformed values", () => {
    expect(limitQuery("500", 25, 100)).toBe(100);
    expect(() => limitQuery("1.5", 25, 100)).toThrow("positive integer");
  });

  it("validates calendar dates", () => {
    expect(dateQuery("2026-07-23", "from")?.toISOString()).toBe("2026-07-23T00:00:00.000Z");
    expect(() => dateQuery("2026-02-30", "from")).toThrow("valid date");
  });

  it("trims and bounds strings", () => {
    expect(stringQuery("  hello  ", "search", 10)).toBe("hello");
    expect(() => stringQuery("", "search", 10)).toThrow("between 1 and 10");
    expect(() => stringQuery("too long", "search", 3)).toThrow("between 1 and 3");
  });

  it("accepts only declared enum values", () => {
    expect(enumQuery("PRO", "plan", ["FREE", "PRO"] as const)).toBe("PRO");
    expect(() => enumQuery("STUDIO", "plan", ["FREE", "PRO"] as const)).toThrow(
      "plan must be one of",
    );
  });

  it("parses explicit booleans", () => {
    expect(booleanQuery("true", "enabled")).toBe(true);
    expect(booleanQuery("false", "enabled")).toBe(false);
    expect(booleanQuery(undefined, "enabled")).toBeUndefined();
    expect(() => booleanQuery("1", "enabled")).toThrow("enabled must be true or false");
  });
});
