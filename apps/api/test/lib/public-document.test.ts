import { afterEach, expect, it, vi } from "vitest";
import { fetchPublicDocument, readPublicDocument } from "../../src/lib/public-document.js";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("rejects oversized declared lengths before reading and cancels the response", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream({ cancel });
  await expect(
    readPublicDocument(
      new Response(body, { headers: { "content-length": "1000" } }),
      10,
      new AbortController().signal,
    ),
  ).rejects.toThrow("byte limit");
  expect(cancel).toHaveBeenCalledOnce();
});
it("limits decompressed bytes with no trustworthy length and cancels on overflow", async () => {
  const cancel = vi.fn();
  let reads = 0;
  const body = new ReadableStream({
    pull(controller) {
      reads++;
      controller.enqueue(new Uint8Array(8));
    },
    cancel,
  });
  await expect(
    readPublicDocument(
      new Response(body, { headers: { "content-length": "2", "content-encoding": "gzip" } }),
      10,
      new AbortController().signal,
    ),
  ).rejects.toThrow("byte limit");
  expect(cancel).toHaveBeenCalledOnce();
  expect(reads).toBeLessThanOrEqual(3);
});
it("decodes multibyte UTF-8 split across chunks within the cap", async () => {
  const bytes = new TextEncoder().encode("A€B");
  const body = new ReadableStream({
    start(c) {
      c.enqueue(bytes.slice(0, 2));
      c.enqueue(bytes.slice(2));
      c.close();
    },
  });
  expect(await readPublicDocument(new Response(body), 5, new AbortController().signal)).toBe("A€B");
});
it("coalesces simultaneous requests and caches bounded successful documents", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("# Small README"));
  vi.stubGlobal("fetch", fetcher);
  const requests = Array.from({ length: 10 }, () =>
    fetchPublicDocument("https://apify.com/test/coalesced.md", "text/markdown"),
  );
  expect(await Promise.all(requests)).toEqual(Array(10).fill("# Small README"));
  await fetchPublicDocument("https://apify.com/test/coalesced.md", "text/markdown");
  expect(fetcher).toHaveBeenCalledOnce();
});
it("does not retry oversized bodies", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response("", { headers: { "content-length": String(3 * 1024 * 1024) } }),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    fetchPublicDocument("https://apify.com/test/large.md", "text/markdown"),
  ).rejects.toThrow("byte limit");
  expect(fetcher).toHaveBeenCalledOnce();
});
it("enforces the deadline even when the runtime fetch ignores AbortSignal", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => new Promise(() => {})),
  );
  const document = fetchPublicDocument("https://apify.com/test/stalled.md", "text/markdown", {
    attempts: 1,
    timeoutMs: 500,
  });
  const assertion = expect(document).rejects.toThrow("took too long");
  await vi.advanceTimersByTimeAsync(501);
  await assertion;
});
