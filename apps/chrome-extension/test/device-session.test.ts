import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PairingExpiredError, verifyDeviceAccount } from "../src/device-session";

const token = `acx_${"a".repeat(64)}`;
const account = {
  userId: "member", name: "Member", username: null, email: "member@example.test",
  image: null, expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};

afterEach(() => vi.unstubAllGlobals());

describe("device verification after the static website migration", () => {
  it("uses the permitted direct API host with the existing scoped credential", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, data: account }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyDeviceAccount(token, account.userId)).toEqual(account);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:4000/extension-device/me");
    expect(options).toMatchObject({
      headers: { authorization: `Bearer ${token}` }, credentials: "omit", cache: "no-store",
    });
    const manifest = JSON.parse(readFileSync(new URL("../static/manifest.json", import.meta.url), "utf8"));
    expect(manifest.host_permissions).toContain(`${new URL(url).origin}/*`);
  });

  it.each([200, 401, 502])("reports an HTML fallback (%s) without invalidating the pairing", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("<!doctype html><html>Website</html>", { status })));
    await expect(verifyDeviceAccount(token, account.userId)).rejects.toThrow("unexpected response");
    await expect(verifyDeviceAccount(token, account.userId)).rejects.not.toBeInstanceOf(PairingExpiredError);
  });

  it("invalidates only a credential explicitly rejected by the API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      ok: false, error: { code: "extension_not_paired" },
    }, { status: 401 })));
    await expect(verifyDeviceAccount(token, account.userId)).rejects.toBeInstanceOf(PairingExpiredError);
  });

  it("reports network failures without claiming the user needs to pair again", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(verifyDeviceAccount(token, account.userId)).rejects.toThrow("Check your internet connection");
  });

  it("preserves server failure messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      ok: false, error: { message: "Maintenance in progress" },
    }, { status: 503 })));
    await expect(verifyDeviceAccount(token, account.userId)).rejects.toThrow("Maintenance in progress");
  });

  it("rejects a response belonging to a different account", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, data: { ...account, userId: "other" } })));
    await expect(verifyDeviceAccount(token, account.userId)).rejects.toThrow("confirm the saved account");
  });
});
