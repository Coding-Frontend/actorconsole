import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { requestBodyLimit } from "../../src/middleware/request-body-limit.js";

function appWithLimit(maxBytes: number) {
  const handler = vi.fn(async (c) => c.body(await c.req.arrayBuffer()));
  const app = new Hono().use("*", requestBodyLimit(maxBytes)).post("/", handler);
  return { app, handler };
}

function streamingRequest(headers?: HeadersInit) {
  const cancel = vi.fn();
  let reads = 0;
  const request = new Request("http://localhost/", {
    method: "POST", headers,
    body: new ReadableStream({
      pull(controller) {
        reads += 1;
        controller.enqueue(new Uint8Array(8));
        if (reads === 10) controller.close();
      },
      cancel,
    }),
    duplex: "half",
  } as RequestInit);
  return { request, cancel, reads: () => reads };
}

describe("request body byte limits", () => {
  it.each([undefined, { "content-length": "1" }])("counts and cancels a streamed body with headers %j", async (headers) => {
    const { app, handler } = appWithLimit(10);
    const stream = streamingRequest(headers);
    const response = await app.request(stream.request);
    expect(response.status).toBe(413);
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(stream.reads()).toBeLessThan(5);
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects and cancels a declared oversized body", async () => {
    const { app, handler } = appWithLimit(10);
    const stream = streamingRequest({ "content-length": "80" });
    expect((await app.request(stream.request)).status).toBe(413);
    expect(stream.cancel).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it("preserves exact binary bytes at the limit", async () => {
    const { app } = appWithLimit(8);
    const bytes = new Uint8Array([0, 255, 128, 13, 10, 1, 2, 3]);
    const response = await app.request("/", { method: "POST", body: bytes });
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("allows a bodyless request", async () => {
    const { app } = appWithLimit(8);
    expect((await app.request("/", { method: "POST" })).status).toBe(200);
  });
});
