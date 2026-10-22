import { describe, expect, it } from "vitest";
import { selectActiveApifyConsoleCredential } from "./integrations";

describe("Console credential selection", () => {
  it("prefers cookies over a healthy manual UI key", () => {
    expect(
      selectActiveApifyConsoleCredential({
        uiConfigured: true,
        uiTestStatus: "ok",
        cookiesConfigured: true,
        cookiesTestStatus: "ok",
      }),
    ).toBe("apify_cookies");
  });

  it("uses a healthy manual key if cookies have failed", () => {
    expect(
      selectActiveApifyConsoleCredential({
        uiConfigured: true,
        uiTestStatus: "ok",
        cookiesConfigured: true,
        cookiesTestStatus: "error",
      }),
    ).toBe("apify_ui_token");
  });

  it("does not select either failed credential", () => {
    expect(
      selectActiveApifyConsoleCredential({
        uiConfigured: true,
        uiTestStatus: "error",
        cookiesConfigured: true,
        cookiesTestStatus: "error",
      }),
    ).toBeNull();
  });
});
