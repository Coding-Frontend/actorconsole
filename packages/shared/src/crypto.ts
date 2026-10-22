import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * AES-256-GCM symmetric encryption for integration credentials stored in the DB.
 *
 * Key derivation: scryptSync(APP_ENCRYPTION_KEY, salt, 32) where salt is the
 * integration's `key` field (e.g. "razorpay_key_secret"). This means the same
 * passphrase + same key derives the same encryption key.
 *
 * Format: `v1:<iv-hex>:<tag-hex>:<ciphertext-hex>` — versioned so we can rotate.
 */

const VERSION = "v1";
const KEY_LEN = 32;
const IV_LEN = 12;
const SALT_PEPPER = "actorconsole-integration-v1";

function deriveKey(passphrase: string, keyName: string): Buffer {
  const salt = `${SALT_PEPPER}:${keyName}`;
  return scryptSync(passphrase, salt, KEY_LEN);
}

export function encrypt(plaintext: string, passphrase: string, keyName: string): string {
  if (!passphrase) throw new Error("Encryption passphrase is required");
  const key = deriveKey(passphrase, keyName);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decrypt(payload: string, passphrase: string, keyName: string): string {
  if (!passphrase) throw new Error("Encryption passphrase is required");
  const [version, ivHex, tagHex, ctHex] = payload.split(":");
  if (version !== VERSION) throw new Error(`Unknown encryption version: ${version}`);
  if (!ivHex || !tagHex || !ctHex) throw new Error("Malformed ciphertext");

  const key = deriveKey(passphrase, keyName);
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ct = Buffer.from(ctHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString("utf8");
}

export function maskSecret(
  value: string,
  opts: { visiblePrefix?: number; visibleSuffix?: number } = {},
): string {
  if (!value) return "";
  const prefix = opts.visiblePrefix ?? 6;
  const suffix = opts.visibleSuffix ?? 4;
  if (value.length <= prefix + suffix) return "•".repeat(value.length);
  const head = value.slice(0, prefix);
  const tail = value.slice(-suffix);
  const middle = "•".repeat(Math.max(4, value.length - prefix - suffix));
  return `${head}${middle}${tail}`;
}

export function looksLikeSecret(value: string): boolean {
  return /^(sk_|pk_|rzp_|whsec_|ghp_|github_pat_|AKIA|AIza)/.test(value);
}

/**
 * Mask a GitHub PAT for UI display. Preserves the prefix type so users can
 * distinguish classic (`ghp_…a1b2`) from fine-grained (`github_pat_…a1b2`).
 */
export function maskPat(token: string): string {
  if (!token) return "";
  // keep the prefix type (ghp_ / github_pat_ / gho_) and the last 4 chars
  const m = token.match(/^(ghp_|github_pat_|gho_)/);
  const prefix = m ? m[1] : "";
  if (token.length <= prefix.length + 4) return `${prefix}••••`;
  return `${prefix}…${token.slice(-4)}`;
}
