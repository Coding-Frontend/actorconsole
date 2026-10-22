import { describe, it, expect } from "vitest";
import { encrypt, decrypt, maskSecret, looksLikeSecret, maskPat } from "./crypto.js";

describe("crypto.encrypt/decrypt", () => {
  const PASSPHRASE = "test-passphrase-with-entropy-1234567890";
  const KEY = "razorpay_key_secret";

  it("round-trips plaintext", () => {
    const plaintext = "encryption-round-trip-fixture";
    const ct = encrypt(plaintext, PASSPHRASE, KEY);
    expect(ct).toMatch(/^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
    expect(decrypt(ct, PASSPHRASE, KEY)).toBe(plaintext);
  });

  it("produces different ciphertext each call (random IV)", () => {
    const a = encrypt("same plaintext", PASSPHRASE, KEY);
    const b = encrypt("same plaintext", PASSPHRASE, KEY);
    expect(a).not.toBe(b);
    // But both decrypt to the same value
    expect(decrypt(a, PASSPHRASE, KEY)).toBe("same plaintext");
    expect(decrypt(b, PASSPHRASE, KEY)).toBe("same plaintext");
  });

  it("uses different derived keys for different keyNames", () => {
    const plaintext = "secret";
    const ct = encrypt(plaintext, PASSPHRASE, KEY);
    // Decrypting with the wrong keyName should fail (auth tag mismatch)
    expect(() => decrypt(ct, PASSPHRASE, "different_key")).toThrow();
  });

  it("rejects empty passphrase", () => {
    expect(() => encrypt("x", "", KEY)).toThrow();
    expect(() => decrypt("v1:0:0:0", "", KEY)).toThrow();
  });

  it("rejects unknown version", () => {
    expect(() => decrypt("v9:00:00:00", PASSPHRASE, KEY)).toThrow(/Unknown encryption version/);
  });

  it("rejects malformed ciphertext", () => {
    // Wrong version triggers "Unknown encryption version"
    expect(() => decrypt("not-encrypted", PASSPHRASE, KEY)).toThrow(/Unknown encryption version/);
    // v1 prefix with missing parts triggers "Malformed ciphertext"
    expect(() => decrypt("v1:only-one-part", PASSPHRASE, KEY)).toThrow(/Malformed ciphertext/);
  });

  it("rejects tampered ciphertext (auth tag)", () => {
    const ct = encrypt("hello", PASSPHRASE, KEY);
    // Flip one hex char in the ciphertext portion
    const parts = ct.split(":");
    const tampered = parts[3].split("");
    tampered[0] = tampered[0] === "0" ? "1" : "0";
    parts[3] = tampered.join("");
    const bad = parts.join(":");
    expect(() => decrypt(bad, PASSPHRASE, KEY)).toThrow();
  });
});

describe("crypto.maskSecret", () => {
  it("keeps the first 6 and last 4 chars by default", () => {
    // value has 39 chars; prefix=6, suffix=4, so middle has max(4, 29)=29 dots
    const v = "sk_live_51Hxxxx_super_long_secret_value";
    expect(v.length).toBe(39);
    expect(maskSecret(v)).toBe("sk_liv" + "•".repeat(29) + "alue");
  });

  it("fully masks short strings", () => {
    expect(maskSecret("abc")).toBe("•••");
  });

  it("respects custom prefix/suffix", () => {
    // 10 chars, prefix=2, suffix=2, middle = max(4, 6) = 6 dots
    expect(maskSecret("abcdefghij", { visiblePrefix: 2, visibleSuffix: 2 })).toBe(
      "ab" + "•".repeat(6) + "ij",
    );
  });

  it("uses minimum 4 dots even when value is short", () => {
    // 8 chars, prefix=2, suffix=2 → middle = max(4, 4) = 4 dots
    expect(maskSecret("abcdefgh", { visiblePrefix: 2, visibleSuffix: 2 })).toBe(
      "ab" + "•".repeat(4) + "gh",
    );
  });

  it("handles empty", () => {
    expect(maskSecret("")).toBe("");
  });
});

describe("crypto.looksLikeSecret", () => {
  it("detects Stripe", () => {
    expect(looksLikeSecret("sk_live_abc")).toBe(true);
    expect(looksLikeSecret("pk_test_abc")).toBe(true);
  });
  it("detects Razorpay", () => {
    expect(looksLikeSecret("rzp_live_abc123")).toBe(true);
    expect(looksLikeSecret("rzp_test_abc123")).toBe(true);
  });
  it("detects webhook secrets", () => {
    expect(looksLikeSecret("whsec_abcdef")).toBe(true);
  });
  it("detects GitHub PATs", () => {
    expect(looksLikeSecret("ghp_abcdefghij")).toBe(true);
    expect(looksLikeSecret("github_pat_11ABCXYZ0_xyz")).toBe(true);
  });
  it("detects AWS access keys", () => {
    expect(looksLikeSecret("AKIAIOSFODNN7EXAMPLE")).toBe(true);
  });
  it("rejects regular strings", () => {
    expect(looksLikeSecret("hello world")).toBe(false);
    expect(looksLikeSecret("user@example.com")).toBe(false);
  });
});

describe("crypto.maskPat", () => {
  it("preserves ghp_ prefix and last 4", () => {
    const token = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";
    expect(maskPat(token)).toBe("ghp_…7890");
  });
  it("preserves github_pat_ prefix", () => {
    const token = "github_pat_11ABCXYZ0_xyz_super_long_value_1234abcd";
    expect(maskPat(token)).toBe("github_pat_…abcd");
  });
  it("returns a basic mask for unrecognized prefixes", () => {
    expect(maskPat("opaque_random_token_xxxxxxxxx")).toMatch(/^…\w{4}$/);
  });
  it("handles empty", () => {
    expect(maskPat("")).toBe("");
  });
  it("handles very short tokens", () => {
    expect(maskPat("ghp_abc")).toBe("ghp_••••");
  });
});
