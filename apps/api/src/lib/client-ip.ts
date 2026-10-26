import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { isIP } from "node:net";

export function canonicalAddress(value: string): string | null {
  const address = value.trim();
  const family = isIP(address);
  if (family === 4) return address;
  if (family !== 6 || address.includes("%")) return null;
  const normalized = new URL(`http://[${address}]`).hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(normalized);
  if (!mapped) return normalized;
  const high = parseInt(mapped[1], 16);
  const low = parseInt(mapped[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

/**
 * Trust socket metadata first. Only explicitly named proxy peers may supply a
 * forwarding chain, walked from the nearest hop to the first untrusted address.
 * CF-Connecting-IP and X-Real-IP are never independent proof of caller identity.
 */
export function resolveClientIp(c: Context): string {
  let peer: string | null;
  try {
    peer = canonicalAddress(getConnInfo(c).remote.address ?? "");
  } catch {
    peer = null;
  }
  if (!peer) return "unknown";
  const trusted = new Set((process.env.TRUSTED_PROXY_IPS ?? "").split(",")
    .map(canonicalAddress).filter((address): address is string => address !== null));
  if (!trusted.has(peer)) return peer;
  const forwarded = c.req.header("x-forwarded-for");
  if (!forwarded) return peer;
  const parts = forwarded.split(",");
  if (parts.length > 32) return peer;
  const chain = parts.map(canonicalAddress);
  if (chain.some((address) => address === null)) return peer;
  let address = peer;
  for (let index = chain.length - 1; index >= 0 && trusted.has(address); index -= 1) {
    address = chain[index]!;
  }
  return address;
}
