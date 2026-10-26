import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyResendSignature } from "./webhook-verify.js";

const key = Buffer.from("test-resend-signing-key");
const secret = `whsec_${key.toString("base64")}`;

function signedRequest() {
  const body = JSON.stringify({ type: "email.delivered" });
  const id = "msg_test";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `v1,${createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`, "utf8")
    .digest("base64")}`;
  return { body, id, timestamp, signature, secret };
}

describe("Resend webhook signature verification", () => {
  it("accepts a valid signature", () => {
    expect(verifyResendSignature(signedRequest())).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifyResendSignature({ ...signedRequest(), body: "{}" })).toBe(false);
  });

  it("rejects a different signing secret", () => {
    expect(
      verifyResendSignature({
        ...signedRequest(),
        secret: Buffer.from("wrong").toString("base64"),
      }),
    ).toBe(false);
  });

  it("rejects missing signatures and stale timestamps", () => {
    expect(verifyResendSignature({ ...signedRequest(), signature: null })).toBe(false);
    expect(verifyResendSignature({ ...signedRequest(), timestamp: "1" })).toBe(false);
  });

  it("rejects unsupported signature versions", () => {
    const request = signedRequest();
    expect(verifyResendSignature({ ...request, signature: request.signature.replace("v1,", "v2,") })).toBe(false);
  });

  it("rejects non-ASCII signatures without throwing", () => {
    expect(verifyResendSignature({ ...signedRequest(), signature: `v1,${"é".repeat(44)}` })).toBe(false);
  });

  it("rejects a malformed candidate with extra signature fields", () => {
    const request = signedRequest();
    expect(verifyResendSignature({ ...request, signature: `${request.signature},extra` })).toBe(false);
  });

  it("accepts a valid signature during key rotation", () => {
    const request = signedRequest();
    expect(verifyResendSignature({ ...request, signature: `v1,invalid ${request.signature}` })).toBe(true);
  });
});
