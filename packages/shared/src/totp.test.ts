import { describe, expect, it } from "vitest";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  totpCode,
  totpUri,
  verifyTotpCode,
} from "./totp.js";

describe("TOTP", () => {
  it("matches the RFC 6238 SHA-1 vector at six digits", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(totpCode(secret, 59_000)).toBe("287082");
  });

  it("accepts the current and adjacent 30-second windows only", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const current = totpCode(secret, now);
    expect(verifyTotpCode(secret, current, now)).toBe(true);
    expect(verifyTotpCode(secret, totpCode(secret, now + 30_000), now)).toBe(true);
    expect(verifyTotpCode(secret, "not-a-code", now)).toBe(false);
    expect(verifyTotpCode(secret, "123", now)).toBe(false);
  });

  it("creates an authenticator URI and one-time recovery-code hashes", () => {
    const secret = generateTotpSecret();
    const uri = totpUri({ secret, account: "builder@example.com", issuer: "ActorConsole" });
    expect(uri).toContain("otpauth://totp/ActorConsole%3Abuilder%40example.com");
    expect(uri).toContain(`secret=${secret}`);

    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    expect(hashRecoveryCode(codes[0]!, "user-1", "pepper")).toBe(
      hashRecoveryCode(codes[0]!.replace("-", ""), "user-1", "pepper"),
    );
    expect(hashRecoveryCode(codes[0]!, "user-2", "pepper")).not.toBe(
      hashRecoveryCode(codes[0]!, "user-1", "pepper"),
    );
  });
});
