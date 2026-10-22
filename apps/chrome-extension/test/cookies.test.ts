import { describe, expect, it } from "vitest";
import { selectApifyRtCookie, type CookieCandidate } from "../src/cookies";

const cookie = (input: Partial<CookieCandidate> = {}): CookieCandidate => ({
  name: "ApifyRT",
  value: "refresh-value",
  domain: "console-backend.apify.com",
  ...input,
});

describe("selectApifyRtCookie", () => {
  it("returns only the live backend ApifyRT value", () => {
    expect(
      selectApifyRtCookie(
        [cookie({ name: "analytics", value: "discard" }), cookie()],
        [cookie({ domain: "console.apify.com", value: "wrong" })],
        100,
      ),
    ).toEqual({ ok: true, value: "refresh-value" });
  });

  it("reports a wrong-domain cookie without returning its value", () => {
    const result = selectApifyRtCookie([], [cookie({ domain: "console.apify.com" })], 100);
    expect(result).toMatchObject({ ok: false, reason: "wrong_domain" });
    expect(JSON.stringify(result)).not.toContain("refresh-value");
  });

  it("rejects expired backend cookies", () => {
    expect(
      selectApifyRtCookie([cookie({ expirationDate: 99 })], [], 100),
    ).toMatchObject({ ok: false, reason: "expired" });
  });

  it("reports a missing session", () => {
    expect(selectApifyRtCookie([], [], 100)).toMatchObject({ ok: false, reason: "missing" });
  });
});
