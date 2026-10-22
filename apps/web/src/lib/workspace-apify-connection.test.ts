import { describe, expect, it } from "vitest";
import { workspaceApifySetupReason } from "./workspace-apify-connection";

describe("workspace Apify setup", () => {
  it("distinguishes failed status checks from disconnected workspaces", () => {
    expect(workspaceApifySetupReason(null)).toBe("unavailable");
    expect(workspaceApifySetupReason({ connected: false })).toBe("connect");
  });
  it("requires an API key for a Console-only workspace", () => {
    expect(
      workspaceApifySetupReason({
        connected: true,
        apiKeyConfigured: false,
        cookiesConfigured: true,
      }),
    ).toBe("api-key");
  });
  it.each(["INVALID", "EXPIRED", "ERROR", "FAILED"])(
    "offers repair for a %s key",
    (apiTokenStatus) => {
      expect(
        workspaceApifySetupReason({ connected: true, apiKeyConfigured: true, apiTokenStatus }),
      ).toBe("repair-api");
    },
  );
  it("keeps API-only operations available and offers optional Console analytics setup", () => {
    const status = { connected: true, apiKeyConfigured: true, apiOperationsAvailable: true };
    expect(workspaceApifySetupReason(status)).toBeNull();
    expect(workspaceApifySetupReason(status, "console")).toBe("console");
    expect(
      workspaceApifySetupReason(
        { ...status, cookiesConfigured: true, consoleOperationsAvailable: true },
        "console",
      ),
    ).toBeNull();
  });
});
