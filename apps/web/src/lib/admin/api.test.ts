import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-base", () => ({ SERVER_API_BASE_URL: "https://api.example.test/" }));

import { api } from "./api";

describe("admin API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves the HTTP status and normalizes an API error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: { code: "unavailable" } }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const result = await api("/admin/users");

    expect(result).toEqual({
      ok: false,
      status: 503,
      error: {
        code: "unavailable",
        message: "The admin API request failed with HTTP 503",
      },
    });
  });

  it("rejects a malformed success response instead of returning undefined data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      ),
    );

    const result = await api("/admin/users");

    expect(result).toEqual({
      ok: false,
      status: 200,
      error: {
        code: "invalid_response",
        message: "The admin API returned an invalid response",
      },
    });
  });
});
