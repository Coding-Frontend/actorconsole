import { describe, expect, it } from "vitest";
import { isApifyResumeUrl, parseApifyResumeSession, parseResumeViewedUserId } from "../src/apify-resume";

describe("Apify authentication resume detection", () => {
  it("matches only the Console Backend resume endpoint", () => {
    const base = "https://console.apify.com/actors";
    expect(
      isApifyResumeUrl("https://console-backend.apify.com/public/authentication/resume", base),
    ).toBe(true);
    expect(
      isApifyResumeUrl("https://console-backend.apify.com/public/authentication/login", base),
    ).toBe(false);
    expect(isApifyResumeUrl("https://example.com/public/authentication/resume", base)).toBe(false);
  });

  it("extracts the user ID and UI token from the resume response", () => {
    const session = { userId: "fixtureUser12345", uiToken: `apify_ui_${"a".repeat(32)}` };
    expect(parseApifyResumeSession(session)).toEqual(session);
    expect(parseApifyResumeSession({ data: session })).toEqual(session);
  });

  it("rejects incomplete or unrelated responses", () => {
    expect(parseApifyResumeSession({ userId: "fixtureUser12345" })).toBeNull();
    expect(
      parseApifyResumeSession({ userId: "fixtureUser12345", uiToken: "apify_api_bad" }),
    ).toBeNull();
    expect(
      parseApifyResumeSession({ userId: "../other", uiToken: `apify_ui_${"a".repeat(32)}` }),
    ).toBeNull();
  });

  it("reads only a valid viewed account ID from the resume request", () => {
    expect(parseResumeViewedUserId('{"viewedUserId":"organization123"}')).toBe("organization123");
    expect(parseResumeViewedUserId({ viewedUserId: "personal123" })).toBe("personal123");
    expect(parseResumeViewedUserId('{"viewedUserId":"../other"}')).toBeNull();
    expect(parseResumeViewedUserId("not-json")).toBeNull();
  });
});
