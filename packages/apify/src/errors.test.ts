import { describe, expect, it } from "vitest";
import { mapStatusToCode, toApifyClientError } from "./errors.js";

describe("Apify error mapping", () => {
  it("recognizes the daily Actor publication quota independently of HTTP status", () => {
    expect(mapStatusToCode(400, "daily-publication-limit-exceeded")).toBe(
      "daily_publication_limit",
    );
    expect(
      toApifyClientError({
        statusCode: 400,
        type: "daily-publication-limit-exceeded",
        message: "The Actor publication limit for the last 24 hours was exceeded",
      }),
    ).toMatchObject({
      code: "daily_publication_limit",
      status: 400,
    });
    expect(
      toApifyClientError({
        statusCode: 400,
        errorCode: "daily-publication-limit-exceeded",
        message: "The Actor publication limit for the last 24 hours was exceeded",
      }),
    ).toMatchObject({ code: "daily_publication_limit", status: 400 });
  });
});
