import { BoundedTtlCache } from "@actorconsole/shared";

export const PUBLIC_MARKDOWN_MAX_BYTES = 512 * 1024;
export const PUBLIC_HTML_MAX_BYTES = 2 * 1024 * 1024;
class DocumentTooLarge extends Error {}
class UpstreamHttpError extends Error {
  constructor(public status: number) {
    super(`Apify Store returned HTTP ${status}`);
  }
}
const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
const documents = new BoundedTtlCache<string>(16, 8 * 1024 * 1024, (value) =>
  Buffer.byteLength(value),
);
const pending = new Map<string, Promise<string>>();

/** The fetch body is decompressed by Node; count those bytes before decoding. */
export async function readPublicDocument(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new DocumentTooLarge("Apify Store document exceeds the byte limit");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes)
        throw new DocumentTooLarge("Apify Store document exceeds the byte limit");
      chunks.push(value);
    }
    return Buffer.concat(chunks, size).toString("utf8");
  } finally {
    signal.removeEventListener("abort", onAbort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function fetchPublicDocument(
  url: string,
  accept: string,
  options: { attempts?: number; timeoutMs?: number } = {},
): Promise<string> {
  const key = `${accept}:${url}`;
  const cached = documents.get(key);
  if (cached !== undefined) return cached;
  const underway = pending.get(key);
  if (underway) return underway;
  if (pending.size >= 16) throw new Error("Public document lookup is busy");
  const operation = loadDocument(url, accept, options);
  pending.set(key, operation);
  try {
    const document = await operation;
    documents.set(key, document, 5 * 60_000);
    return document;
  } finally {
    pending.delete(key);
  }
}

async function loadDocument(
  url: string,
  accept: string,
  options: { attempts?: number; timeoutMs?: number },
) {
  const attempts = Math.min(Math.max(options.attempts ?? 3, 1), 3);
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 4_000, 500), 8_000);
  const maxBytes = accept.includes("text/html") ? PUBLIC_HTML_MAX_BYTES : PUBLIC_MARKDOWN_MAX_BYTES;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error("Apify Store document took too long");
        controller.abort(error);
        reject(error);
      }, timeoutMs);
    });
    try {
      const response = await Promise.race([
        fetch(url, { headers: { accept }, signal: controller.signal }),
        deadline,
      ]);
      if (response.ok)
        return await Promise.race([
          readPublicDocument(response, maxBytes, controller.signal),
          deadline,
        ]);
      await response.body?.cancel();
      throw new UpstreamHttpError(response.status);
    } catch (error) {
      if (
        error instanceof DocumentTooLarge ||
        (error instanceof UpstreamHttpError && !retryableStatuses.has(error.status))
      )
        throw error;
      lastError = error;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
    if (attempt + 1 < attempts)
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
  }
  throw lastError;
}
