import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET_STATE, REGISTER_HANDOFF, UNPAIR } from "../src/messages";

const account = {
  userId: "member", name: "Member", username: null, email: "member@example.test",
  image: null, expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};
const token = `acx_${"a".repeat(64)}`;
let local: Record<string, unknown>;
let session: Record<string, unknown>;
let listener: (message: unknown, sender: chrome.runtime.MessageSender, reply: (value: unknown) => void) => void;

function storage(values: Record<string, unknown>) {
  return {
    get: vi.fn(async (key: string) => ({ [key]: values[key] })),
    set: vi.fn(async (data: Record<string, unknown>) => { Object.assign(values, data); }),
    remove: vi.fn(async (keys: string | string[]) => { for (const key of [keys].flat()) delete values[key]; }),
    setAccessLevel: vi.fn().mockResolvedValue(undefined),
  };
}

function send(message: unknown, sender: chrome.runtime.MessageSender = {}) {
  return new Promise<Record<string, unknown>>((resolve) => {
    listener(message, sender, (value) => resolve(value as Record<string, unknown>));
  });
}

beforeEach(async () => {
  vi.resetModules();
  local = { pairedDevice: { token, account } };
  session = {};
  vi.stubGlobal("chrome", {
    storage: { local: storage(local), session: storage(session) },
    sidePanel: { setPanelBehavior: vi.fn().mockResolvedValue(undefined) },
    runtime: {
      onMessage: { addListener: vi.fn((callback) => { listener = callback; }) },
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
    tabs: { onRemoved: { addListener: vi.fn() } },
  });
  await import("../src/background");
});

afterEach(() => vi.unstubAllGlobals());

describe("extension website connectivity", () => {
  it("verifies the saved pairing and loads workspaces from the direct API", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: true, data: account }))
      .mockResolvedValueOnce(Response.json({ ok: true, data: [{ id: "workspace", name: "Workspace" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await send({ type: GET_STATE });
    expect(result.actorConsoleAccount).toEqual(account);
    expect(result.actorConsoleError).toBeNull();
    expect(result.workspaces).toEqual([{ id: "workspace", name: "Workspace" }]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:4000/extension-device/me",
      "http://localhost:4000/extension-device/workspaces",
    ]);
    expect(local.pairedDevice).toEqual({ token, account });
  });

  it("retains credentials on failure and recovers using the same pairing on retry", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(Response.json({ ok: true, data: account }))
      .mockResolvedValueOnce(Response.json({ ok: true, data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const failed = await send({ type: GET_STATE });
    expect(failed.actorConsoleAccount).toBeNull();
    expect(failed.pairingStored).toBe(true);
    expect(failed.actorConsoleError).toContain("internet connection");
    expect(local.pairedDevice).toEqual({ token, account });
    const recovered = await send({ type: GET_STATE });
    expect(recovered.actorConsoleAccount).toEqual(account);
    expect(recovered.actorConsoleError).toBeNull();
  });

  it("relays verification failures to the website handoff", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      ok: false, error: { message: "Maintenance in progress" },
    }, { status: 503 })));
    const result = await send({ type: REGISTER_HANDOFF, payload: {
      handoffId: "handoff", challenge: "a".repeat(64),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      workspace: { id: "workspace", name: "Workspace" }, account: null,
    } }, { tab: { id: 1, url: "http://localhost:8080/dashboard/apify" } as chrome.tabs.Tab });
    expect(result).toEqual({ ok: false, error: "Maintenance in progress" });
    expect(local.pairedDevice).toEqual({ token, account });
  });

  it("authorizes a website handoff through the direct API for the detected Apify account", async () => {
    session.detectedAccount = {
      userId: "apifyUser123", observedAt: new Date().toISOString(),
      selectedAccountId: "apifyUser123", organizations: [], organizationsStatus: "ready",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: true, data: account }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const handoff = {
      handoffId: "handoff", challenge: "a".repeat(64),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      workspace: { id: "workspace", name: "Workspace" }, account: null,
    };
    expect(await send({ type: REGISTER_HANDOFF, payload: handoff }, {
      tab: { id: 1, url: "http://localhost:8080/dashboard/apify" } as chrome.tabs.Tab,
    })).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenLastCalledWith("http://localhost:4000/extension-device/authorize-handoff", expect.objectContaining({
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      credentials: "omit", body: JSON.stringify({
        handoffId: handoff.handoffId, challenge: handoff.challenge,
        apifyAccountId: "apifyUser123", apifyAccountType: "PERSONAL",
      }),
    }));
    expect(session.pendingHandoff).toMatchObject({ tabId: 1, account: { id: "apifyUser123", type: "PERSONAL" } });
  });

  it("clears an expired pairing and explains why sign-in is required", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      ok: false, error: { code: "extension_not_paired" },
    }, { status: 401 })));
    const result = await send({ type: GET_STATE });
    expect(result.pairingStored).toBe(false);
    expect(result.actorConsoleError).toContain("expired or was revoked");
    expect(local.pairedDevice).toBeUndefined();
  });

  it("revokes the device using the direct API on sign-out", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await send({ type: UNPAIR })).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/extension-device/me", expect.objectContaining({
      method: "DELETE", headers: { authorization: `Bearer ${token}` }, credentials: "omit",
    }));
    expect(local.pairedDevice).toBeUndefined();
  });
});
