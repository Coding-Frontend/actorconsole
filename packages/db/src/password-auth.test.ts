import { describe, expect, it } from "vitest";
import {
  hashPassword,
  isValidAuthEmail,
  isValidPassword,
  normalizeAuthEmail,
  verifyPassword,
} from "./password-auth";

describe("local password authentication", () => {
  it("normalizes and validates email addresses", () => {
    expect(normalizeAuthEmail(" USER@Example.com ")).toBe("user@example.com");
    expect(isValidAuthEmail("user@example.com")).toBe(true);
    expect(isValidAuthEmail("not-an-email")).toBe(false);
  });

  it("enforces the password length boundary", () => {
    expect(isValidPassword("short")).toBe(false);
    expect(isValidPassword("long-enough")).toBe(true);
    expect(isValidPassword("x".repeat(129))).toBe(false);
  });

  it("hashes passwords with a random salt and verifies them safely", async () => {
    const first = await hashPassword("valid-test-password");
    const second = await hashPassword("valid-test-password");

    expect(first).not.toBe(second);
    await expect(verifyPassword("valid-test-password", first)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", first)).resolves.toBe(false);
    await expect(verifyPassword("valid-test-password", "invalid")).resolves.toBe(false);
  });
});
