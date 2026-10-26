import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalAddress, resolveClientIp } from "../../src/lib/client-ip.js";

afterEach(() => vi.unstubAllEnvs());

async function address(peer: string | undefined, headers: Record<string, string> = {}) {
  const app = new Hono().get("/", (c) => c.text(resolveClientIp(c)));
  return (await app.request("/", { headers }, peer ? { incoming: { socket: { remoteAddress: peer } } } : {})).text();
}

describe("verified requester address", () => {
  it("ignores every forwarding header from an untrusted socket peer", async () => {
    vi.stubEnv("TRUSTED_PROXY_IPS", "");
    expect(await address("::ffff:192.0.2.10", {
      "x-forwarded-for": "203.0.113.1", "x-real-ip": "203.0.113.2", "cf-connecting-ip": "203.0.113.3",
    })).toBe("192.0.2.10");
  });
  it("walks from the verified nearest proxy and stops at the first untrusted hop", async () => {
    vi.stubEnv("TRUSTED_PROXY_IPS", "127.0.0.1, 10.0.0.2");
    expect(await address("::ffff:127.0.0.1", { "x-forwarded-for": "203.0.113.99, 192.0.2.20, 10.0.0.2" })).toBe("192.0.2.20");
  });
  it.each(["garbage, 192.0.2.20", "", Array(34).fill("192.0.2.20").join(",")])("falls back to the peer for an unusable forwarding chain", async (chain) => {
    vi.stubEnv("TRUSTED_PROXY_IPS", "127.0.0.1");
    expect(await address("127.0.0.1", { "x-forwarded-for": chain })).toBe("127.0.0.1");
  });
  it("does not trust headers when runtime peer metadata is absent", async () => {
    vi.stubEnv("TRUSTED_PROXY_IPS", "127.0.0.1");
    expect(await address(undefined, { "x-forwarded-for": "192.0.2.20" })).toBe("unknown");
  });
  it("canonicalizes equivalent IPv6 and mapped IPv4 forms", () => {
    expect(canonicalAddress("2001:0DB8:0000::0001")).toBe("2001:db8::1");
    expect(canonicalAddress("::ffff:c000:20a")).toBe("192.0.2.10");
    expect(canonicalAddress("192.0.2.10")).toBe("192.0.2.10");
    expect(canonicalAddress("fe80::1%eth0")).toBeNull();
  });
});
