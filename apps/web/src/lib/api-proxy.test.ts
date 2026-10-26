// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
const invalidate = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidateTag: invalidate }));

vi.mock("@/lib/api-base", () => ({ SERVER_API_BASE_URL: "https://api.example.test" }));

import { proxyApiRequest } from "./api-proxy";

describe("proxyApiRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("preserves immutable caching for versioned website logo assets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("logo", {
          headers: {
            "cache-control": "public, max-age=31536000, immutable",
            "content-type": "image/webp",
            etag: '"logo-checksum"',
          },
        }),
      ),
    );

    const response = await proxyApiRequest(
      new Request("https://actorconsole.test/api/website-logo-assets/logo-1"),
      ["website-logo-assets", "logo-1"],
    );

    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response.headers.get("etag")).toBe('"logo-checksum"');
    expect(response.headers.get("content-type")).toBe("image/webp");
  });

  it("keeps ordinary proxied API responses non-cacheable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { ok: true },
          { headers: { "cache-control": "public, max-age=31536000" } },
        ),
      ),
    );

    const response = await proxyApiRequest(new Request("https://actorconsole.test/api/actors"), [
      "actors",
    ]);

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("etag")).toBeNull();
  });

  it("caches allowlisted public JSON and strips all caller-specific upstream headers", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }, { headers: { "cache-control": "public, max-age=60" } }));
    vi.stubGlobal("fetch", fetch);
    const response = await proxyApiRequest(new Request("https://actorconsole.test/api/public/catalog/summary", { headers: {
      cookie: "session=alice", authorization: "Bearer private", "x-business-profile-id": "workspace-alice", "x-admin-api-key": "private",
    } }), ["public", "catalog", "summary"]);
    const forwarded = fetch.mock.calls[0][1].headers as Headers;
    expect([...forwarded.entries()]).toEqual([["accept", "application/json"]]);
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
  });

  it.each(["auth/session", "account/workspace-access", "actors/costs", "public/unknown"])("never enables shared caching for %s", async (path) => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }, { headers: { "cache-control": "public, max-age=999" } }));
    vi.stubGlobal("fetch", fetch);
    const response = await proxyApiRequest(new Request(`https://actorconsole.test/api/${path}`, { headers: { cookie: "session=alice" } }), path.split("/"));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetch.mock.calls[0][1].headers.get("cookie")).toBe("session=alice");
  });

  it.each([400, 503])("does not cache public failures (%s)", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status, headers: { "cache-control": "public, max-age=60" } })));
    const response = await proxyApiRequest(new Request("https://actorconsole.test/api/public/seo"), ["public", "seo"]);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not cache a response that sets cookies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { headers: { "cache-control": "public, max-age=60", "set-cookie": "session=new" } })));
    const response = await proxyApiRequest(new Request("https://actorconsole.test/api/public/seo"), ["public", "seo"]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.getSetCookie()).toEqual(["session=new"]);
  });

  it("invalidates the public Data Cache only after accepted admin mutations", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ ok: true })).mockResolvedValueOnce(Response.json({}, { status: 403 })));
    const request = () => new Request("https://actorconsole.test/api/admin/actors/one", { method: "PATCH", body: "{}" });
    await proxyApiRequest(request(), ["admin", "actors", "one"]);
    await proxyApiRequest(request(), ["admin", "actors", "one"]);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith("actorconsole-public-catalog");
  });

  it.each([undefined, "1"])("rejects and cancels oversized chunked requests before forwarding (declared length %s)", async (length) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const cancel = vi.fn();
    let reads = 0;
    const request = new Request("https://actorconsole.test/api/contact", {
      method: "POST", headers: length ? { "content-length": length } : {},
      body: new ReadableStream({
        pull(controller) { reads += 1; controller.enqueue(new Uint8Array(1024 * 1024)); if (reads > 15) controller.close(); }, cancel,
      }), duplex: "half",
    } as RequestInit);
    expect((await proxyApiRequest(request, ["contact"])).status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
    expect(reads).toBeLessThan(10);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("applies the smaller Resend limit before forwarding signed webhook bodies", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await proxyApiRequest(new Request("https://actorconsole.test/api/webhooks/resend", {
      method: "POST", body: new Uint8Array(1_048_577),
    }), ["webhooks", "resend"]);
    expect(response.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves exact signed body bytes and signature headers within the limit", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    const bytes = new Uint8Array([123, 34, 233, 34, 58, 13, 10, 125]);
    await proxyApiRequest(new Request("https://actorconsole.test/api/webhooks/resend", {
      method: "POST", body: bytes, headers: { "svix-signature": "v1,fabricated" },
    }), ["webhooks", "resend"]);
    expect(new Uint8Array(fetch.mock.calls[0][1].body)).toEqual(bytes);
    expect(fetch.mock.calls[0][1].headers.get("svix-signature")).toBe("v1,fabricated");
  });
});
