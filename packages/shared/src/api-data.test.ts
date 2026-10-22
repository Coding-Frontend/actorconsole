import { describe, expect, it } from "vitest";
import { encodeApiData, decodeApiData } from "./api-data";
describe("catalog API transport", () => {
  it("round trips dates, maps, nulls and nested catalog values through JSON", () => {
    const data = { date: new Date("2026-10-06T00:00:00Z"), missing: null, points: new Map([["builder", [{ at: new Date("2026-10-05"), users: 12 }]]]) };
    expect(decodeApiData(JSON.parse(JSON.stringify(encodeApiData(data))))).toEqual(data);
  });
});
