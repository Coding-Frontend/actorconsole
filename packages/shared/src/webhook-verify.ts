import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify Resend/Svix webhook signatures. Resend signs
 * `${svix-id}.${svix-timestamp}.${body}` and sends one or more `v1,<base64>`
 * values in the `svix-signature` header. The dashboard secret is stored as a
 * `whsec_...` base64 value.
 */
export function verifyResendSignature(input: {
  body: string;
  id: string | null | undefined;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  secret: string;
  toleranceSec?: number;
}): boolean {
  const { body, id, timestamp, signature, secret, toleranceSec = 300 } = input;
  if (!id || !timestamp || !signature) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  if (Math.abs(Date.now() / 1000 - timestampNumber) > toleranceSec) return false;

  const key = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const signed = createHmac("sha256", Buffer.from(key, "base64"))
    .update(`${id}.${timestamp}.${body}`, "utf8")
    .digest("base64");
  return signature.split(" ").some((candidate) => {
    const [, value] = candidate.split(",", 2);
    if (!value || value.length !== signed.length) return false;
    return timingSafeEqual(Buffer.from(value), Buffer.from(signed));
  });
}
