import { ACTORCONSOLE_DEVICE_API, type ActorConsoleAccount } from "./messages";

export class PairingExpiredError extends Error {}

/** Verify against the API without using the website's interactive session. */
export async function verifyDeviceAccount(token: string, userId: string): Promise<ActorConsoleAccount> {
  let response: Response;
  try {
    response = await fetch(`${ACTORCONSOLE_DEVICE_API}/me`, {
      headers: { authorization: `Bearer ${token}` },
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new Error("Could not reach ActorConsole. Check your internet connection and retry.");
  }
  const body = await response.json().catch(() => null) as {
    ok?: boolean;
    data?: ActorConsoleAccount;
    error?: { code?: string; message?: string };
  } | null;
  // Only an explicit API rejection invalidates the saved credential. A proxy
  // error or HTML fallback must not silently remove an otherwise valid pairing.
  if (response.status === 401 && body?.error?.code === "extension_not_paired") {
    throw new PairingExpiredError("Your ActorConsole sign-in expired or was revoked. Sign in again.");
  }
  if (!body || typeof body.ok !== "boolean") {
    throw new Error("ActorConsole returned an unexpected response. Update the extension and retry.");
  }
  if (!response.ok || !body.ok) {
    throw new Error(body.error?.message ?? "ActorConsole could not verify the saved connection. Retry shortly.");
  }
  if (!body.data || body.data.userId !== userId || typeof body.data.email !== "string") {
    throw new Error("ActorConsole could not confirm the saved account. Retry the connection.");
  }
  return body.data;
}
