import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { Readable, pipeline } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

/** Reject non-public destinations, including IPv4 embedded in IPv6. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 6) {
    const normalized = address.toLowerCase().replace(/\d+\.\d+\.\d+\.\d+$/, (ipv4) => {
      const [a, b, c, d] = ipv4.split(".").map(Number);
      return `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
    });
    const [left, right] = normalized.split("::");
    const prefix = left ? left.split(":") : [];
    const suffix = right ? right.split(":") : [];
    const groups = (right === undefined
      ? prefix
      : [...prefix, ...Array<string>(8 - prefix.length - suffix.length).fill("0"), ...suffix]
    ).map((value) => parseInt(value, 16));
    if (groups.slice(0, 5).every((value) => value === 0) && groups[5] === 0xffff) {
      return isPrivateAddress(
        `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`,
      );
    }
    // Only global unicast is eligible. Exclude transition, benchmarking and
    // documentation ranges that can encode or reach non-public destinations.
    return (
      (groups[0] & 0xe000) !== 0x2000 ||
      (groups[0] === 0x2001 && (groups[1] < 0x200 || groups[1] === 0xdb8)) ||
      groups[0] === 0x2002 ||
      (groups[0] === 0x3fff && groups[1] < 0x1000)
    );
  }
  if (family !== 4) return true;
  const [a, b, c] = address.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export async function assertSafeLogoUrl(url: URL, signal?: AbortSignal): Promise<LookupAddress[]> {
  signal?.throwIfAborted();
  if (url.protocol !== "https:") throw new Error("Logo sources must use HTTPS");
  if (url.username || url.password) throw new Error("Logo sources must not include credentials");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".local")) {
    throw new Error("Local logo hosts are not allowed");
  }
  const family = isIP(hostname);
  const addresses = family
    ? [{ address: hostname, family }]
    : await abortableLookup(hostname, signal);
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Private network logo hosts are not allowed");
  }
  return addresses;
}

function abortableLookup(hostname: string, signal?: AbortSignal): Promise<LookupAddress[]> {
  if (!signal) return lookup(hostname, { all: true, verbatim: true });
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
      return;
    }
    lookup(hostname, { all: true, verbatim: true }).then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

/** Pin the connection to validated DNS results while retaining Host and TLS verification. */
export async function fetchLogoResource(
  url: URL,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<Response> {
  const addresses = await assertSafeLogoUrl(url, signal);
  return new Promise((resolve, reject) => {
    const req = request(url, {
      headers: { ...headers, "accept-encoding": "gzip, deflate, br" },
      signal,
      // Never reuse a socket whose destination was validated for another request.
      agent: false,
      lookup: (_hostname, options, callback) => {
        const eligible = options.family
          ? addresses.filter((entry) => entry.family === options.family)
          : addresses;
        if (!eligible.length) {
          callback(new Error("Logo host has no eligible public address"), []);
        } else if (options.all) {
          callback(null, eligible);
        } else {
          callback(null, eligible[0].address, eligible[0].family);
        }
      },
    }, (incoming) => {
      const responseHeaders = new Headers();
      for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
        responseHeaders.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
      }
      const status = incoming.statusCode ?? 502;
      const noBody = [204, 205, 304].includes(status);
      let body: Readable = incoming;
      const encoding = responseHeaders.get("content-encoding")?.trim().toLowerCase();
      if (noBody) {
        incoming.destroy();
      } else if (encoding && encoding !== "identity") {
        const decoder = encoding === "gzip" || encoding === "x-gzip" ? createGunzip()
          : encoding === "deflate" ? createInflate()
            : encoding === "br" ? createBrotliDecompress() : null;
        if (!decoder) {
          incoming.destroy();
          reject(new Error("Unsupported website response encoding"));
          return;
        }
        // pipeline propagates cancellation/errors to the socket and decoder.
        pipeline(incoming, decoder, () => undefined);
        body = decoder;
        responseHeaders.delete("content-encoding");
        responseHeaders.delete("content-length");
      }
      resolve(new Response(noBody ? null : Readable.toWeb(body) as ReadableStream<Uint8Array>, {
        status,
        headers: responseHeaders,
      }));
    });
    req.on("error", reject);
    req.end();
  });
}

/** Enforce the limit while reading, even when Content-Length is absent or false. */
export async function readLimitedResponse(response: Response, maxBytes: number, message: string) {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(message);
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error(message);
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
