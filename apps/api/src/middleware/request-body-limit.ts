import type { MiddlewareHandler } from "hono";

/** Bound bytes before parsers or signature verification buffer untrusted input. */
export function requestBodyLimit(maxBytes: number): MiddlewareHandler {
  return async (c, next) => {
    const body = c.req.raw.body;
    if (!body) return next();
    const tooLarge = () => c.json({
      ok: false,
      error: { code: "payload_too_large", message: "Request payload is too large" },
    }, 413);
    if (Number(c.req.header("content-length")) > maxBytes) {
      await body.cancel().catch(() => undefined);
      return tooLarge();
    }
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel().catch(() => undefined);
          return tooLarge();
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    // Preserve the original bytes: signed webhook bodies must not be parsed or re-encoded.
    c.req.raw = new Request(c.req.raw, {
      body: new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);
    return next();
  };
}
