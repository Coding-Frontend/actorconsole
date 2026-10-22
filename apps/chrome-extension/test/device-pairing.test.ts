import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserPairUrl, createBrowserPairRequest, pollBrowserPair } from "../src/device-pairing";

afterEach(() => vi.unstubAllGlobals());

describe("extension browser sign-in", () => {
  it("opens the browser with a challenge while keeping the verifier private", async () => {
    const request = await createBrowserPairRequest();
    const second = await createBrowserPairRequest();
    expect(request.verifier).toMatch(/^[a-f0-9]{64}$/);
    expect(request.verifier).not.toBe(second.verifier);
    expect(request.challenge).toBe(createHash("sha256").update(request.verifier).digest("hex"));
    const url = new URL(browserPairUrl(request));
    expect(url.searchParams.get("mode")).toBe("poll");
    expect(url.searchParams.get("challenge")).toBe(request.challenge);
    expect(url.href).not.toContain(request.verifier);
    expect(url.href).not.toContain("extensionId");
  });
  it("polls without website cookies and waits for approval", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { status: "pending" } })));
    vi.stubGlobal("fetch", fetchMock);
    const request = await createBrowserPairRequest();
    expect(await pollBrowserPair(request)).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/extension-device/poll", expect.objectContaining({
      credentials: "omit", body: JSON.stringify({ verifier: request.verifier }),
    }));
  });
  it("accepts a scoped credential after browser approval", async () => {
    const data = { status: "connected", token: `acx_${"c".repeat(64)}`, userId: "sample", email: "sample@example.com" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data }))));
    expect(await pollBrowserPair(await createBrowserPairRequest())).toEqual(data);
  });
  it("expires the pending sign-in before contacting the server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(pollBrowserPair({ ...await createBrowserPairRequest(), expiresAt: 0 })).rejects.toThrow("expired");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("reports a rejected approval", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: { message: "Start again" } }), { status: 409 })));
    await expect(pollBrowserPair(await createBrowserPairRequest())).rejects.toThrow("Start again");
  });
});
