import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lookupMock, requestMock } = vi.hoisted(() => ({ lookupMock: vi.fn(), requestMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));
vi.mock("node:https", () => ({ request: requestMock }));

import { downloadLogoSource } from "./index";
import { fetchLogoResource } from "./safe-fetch";

function respondWith(bytes: Buffer, rawHeaders: string[]) {
  const incoming = Object.assign(Readable.from([bytes]), { statusCode: 200, rawHeaders });
  requestMock.mockImplementationOnce((_url, _options, onResponse) => {
    const req = new EventEmitter();
    return Object.assign(req, { end() { onResponse(incoming); } });
  });
  return incoming;
}

describe("logo HTTP connection boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // No test in this file can accidentally make an external request.
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request"); }));
    lookupMock.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    requestMock.mockImplementation((_url, _options, onResponse) => {
      const req = new EventEmitter();
      return Object.assign(req, {
        end() {
          queueMicrotask(() => {
            onResponse(Object.assign(Readable.from([Buffer.from("image")]), {
              statusCode: 200,
              rawHeaders: ["Content-Type", "image/png"],
            }));
          });
        },
      });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("pins the socket lookup to the validated address despite a subsequent DNS change", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(downloadLogoSource("https://rebind.test/logo.png")).resolves.toMatchObject({ bytes: Buffer.from("image") });
    const [url, options] = requestMock.mock.calls[0];
    expect(url.hostname).toBe("rebind.test"); // Host and TLS hostname remain authoritative.
    expect(options.agent).toBe(false);
    expect(options.rejectUnauthorized).toBeUndefined(); // Node's TLS verification stays enabled.
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const callback = vi.fn();
    options.lookup("rebind.test", {}, callback);
    expect(callback).toHaveBeenLastCalledWith(null, "8.8.8.8", 4);
    options.lookup("rebind.test", { all: true }, callback);
    expect(callback).toHaveBeenLastCalledWith(null, [{ address: "8.8.8.8", family: 4 }]);
    expect(lookupMock).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a mixed public/private DNS result before opening a socket", async () => {
    lookupMock.mockResolvedValue([{ address: "8.8.8.8", family: 4 }, { address: "::ffff:7f00:1", family: 6 }]);
    await expect(downloadLogoSource("https://mixed.test/logo.png")).rejects.toThrow("Private network");
    expect(requestMock).not.toHaveBeenCalled();
  });

  it.each([
    ["gzip", gzipSync], ["deflate", deflateSync], ["br", brotliCompressSync],
  ] as const)("preserves %s response decoding while applying byte limits to decoded data", async (encoding, compress) => {
    const bytes = Buffer.from("fabricated image bytes");
    const compressed = compress(bytes);
    respondWith(compressed, ["Content-Type", "image/png", "Content-Encoding", encoding, "Content-Length", String(compressed.length)]);
    await expect(downloadLogoSource("https://public.test/logo")).resolves.toMatchObject({ bytes });
  });

  it("rejects an oversized decompressed response", async () => {
    const compressed = gzipSync(Buffer.alloc(5 * 1024 * 1024 + 1));
    const incoming = respondWith(compressed, ["Content-Type", "image/png", "Content-Encoding", "gzip", "Content-Length", String(compressed.length)]);
    await expect(downloadLogoSource("https://public.test/logo")).rejects.toThrow("exceeds 5 MB");
    expect(incoming.destroyed).toBe(true);
  });

  it("cancels the native response stream when its declared size exceeds the limit", async () => {
    const incoming = respondWith(Buffer.from("small"), ["Content-Length", String(6 * 1024 * 1024)]);
    await expect(downloadLogoSource("https://public.test/logo")).rejects.toThrow("exceeds 5 MB");
    expect(incoming.destroyed).toBe(true);
  });

  it("rejects TLS failures rather than retrying with certificate validation disabled", async () => {
    requestMock.mockImplementationOnce((_url, _options, _onResponse) => {
      const req = new EventEmitter();
      return Object.assign(req, { end() { req.emit("error", new Error("certificate verification failed")); } });
    });
    await expect(downloadLogoSource("https://public.test/logo")).rejects.toThrow("certificate verification failed");
    expect(requestMock).toHaveBeenCalledOnce();
    expect(requestMock.mock.calls[0][1].rejectUnauthorized).toBeUndefined();
  });

  it("bounds DNS lookup by the same request deadline before opening a socket", async () => {
    lookupMock.mockImplementation(() => new Promise(() => undefined));
    const controller = new AbortController();
    const pending = fetchLogoResource(new URL("https://public.test/logo"), {}, controller.signal);
    controller.abort(new Error("fixture deadline"));
    await expect(pending).rejects.toThrow("fixture deadline");
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("rechecks DNS on a same-host redirect before connecting again", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);
    requestMock.mockImplementationOnce((_url, _options, onResponse) => {
      const req = new EventEmitter();
      return Object.assign(req, { end() {
        onResponse(Object.assign(Readable.from([]), {
          statusCode: 302,
          rawHeaders: ["Location", "/internal"],
        }));
      } });
    });
    await expect(downloadLogoSource("https://rebind.test/logo.png")).rejects.toThrow("Private network");
    expect(requestMock).toHaveBeenCalledOnce();
    expect(lookupMock).toHaveBeenCalledTimes(2);
  });

  it.each(["http://8.8.8.8/logo.png", "https://user:password@8.8.8.8/logo.png", "https://[::ffff:7f00:1]/logo.png"])(
    "rejects an unsafe URL before opening a socket: %s", async (url) => {
      await expect(downloadLogoSource(url)).rejects.toThrow();
      expect(requestMock).not.toHaveBeenCalled();
    },
  );
});
