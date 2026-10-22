// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { proxyExtensionDevice } from "../../../../.deploy/pages/extension-device-proxy.js";
const token = `Bearer acx_${"a".repeat(64)}`;
const origin = `chrome-extension://${"a".repeat(32)}`;
const request = (path: string, init: RequestInit = {}) =>
  new Request(`http://localhost:8080/api/extension-device${path}`, init);
afterEach(() => vi.unstubAllGlobals());

it("keeps the legacy extension namespace and only public detail pages on the Worker", () => {
  const routes = JSON.parse(
    readFileSync(new URL("../../../../.deploy/pages/_routes.json", import.meta.url), "utf8"),
  );
  expect(routes.include).toEqual([
    "/api/extension-device/*",
    "/builders/*",
    "/blog/*",
    "/changelog/*",
  ]);
  expect(routes.exclude).toEqual(["/builders/compare", "/builders/compare/*", "/changelog/feed"]);
});
it("forwards the scoped credential and query to Node without website cookies or proxy headers", async () => {
  const fetch = vi.fn().mockResolvedValue(
    Response.json(
      { ok: true, data: { userId: "alice" } },
      {
        headers: { "set-cookie": "session=never-copy", "x-request-id": "req-1" },
      },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const response = await proxyExtensionDevice(
    request("/workspaces?apifyUserId=account123", {
      headers: {
        authorization: token,
        origin,
        cookie: "session=private",
        "x-forwarded-for": "spoof",
      },
    }),
  );
  expect(fetch.mock.calls[0][0]).toBe(
    "http://localhost:4000/extension-device/workspaces?apifyUserId=account123",
  );
  const headers = fetch.mock.calls[0][1].headers as Headers;
  expect(headers.get("authorization")).toBe(token);
  expect(headers.get("cookie")).toBeNull();
  expect(headers.get("x-forwarded-for")).toBeNull();
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("access-control-allow-origin")).toBe(origin);
  expect(response.headers.get("x-request-id")).toBe("req-1");
  expect(await response.json()).toEqual({ ok: true, data: { userId: "alice" } });
});
it.each([
  ["/me", {}, 401],
  ["/pair", { method: "POST" }, 404],
  ["/me", { method: "POST", headers: { authorization: token } }, 405],
  ["/me", { headers: { authorization: token, origin: "https://evil.example" } }, 403],
])("rejects disallowed access to %s before contacting Node", async (path, init, status) => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect((await proxyExtensionDevice(request(path, init))).status).toBe(status);
  expect(fetch).not.toHaveBeenCalled();
});
it("supports extension preflight without forwarding it", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const response = await proxyExtensionDevice(
    request("/claim", { method: "OPTIONS", headers: { origin } }),
  );
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
  expect(fetch).not.toHaveBeenCalled();
});
it("forwards claim JSON and preserves Node validation failures", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ ok: false, error: { code: "invalid" } }, { status: 400 }));
  vi.stubGlobal("fetch", fetch);
  const response = await proxyExtensionDevice(
    request("/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"code":"invalid"}',
    }),
  );
  expect(response.status).toBe(400);
  expect(new TextDecoder().decode(fetch.mock.calls[0][1].body)).toBe('{"code":"invalid"}');
});
it("rejects oversized bodies before upstream requests", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(
    (await proxyExtensionDevice(request("/claim", { method: "POST", body: "a".repeat(65_537) })))
      .status,
  ).toBe(413);
  expect(fetch).not.toHaveBeenCalled();
});
it("returns an uncached JSON error if Node responds with HTML or cannot be reached", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response("<html>Bad gateway</html>", { headers: { "content-type": "text/html" } }),
    )
    .mockRejectedValueOnce(new Error("unavailable"));
  vi.stubGlobal("fetch", fetch);
  for (let i = 0; i < 2; i++) {
    const response = await proxyExtensionDevice(
      request("/me", { headers: { authorization: token } }),
    );
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("extension_api_unavailable");
  }
});
