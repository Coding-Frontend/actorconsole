import { ACTORCONSOLE_DEVICE_API, ACTORCONSOLE_ORIGIN, type ActorConsoleAccount } from "./messages";

export type BrowserPairRequest = {
  verifier: string;
  challenge: string;
  expiresAt: number;
};

export async function createBrowserPairRequest(): Promise<BrowserPairRequest> {
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return { verifier, challenge, expiresAt: Date.now() + 10 * 60_000 };
}

export function browserPairUrl(request: BrowserPairRequest): string {
  return `${ACTORCONSOLE_ORIGIN}/extension/pair?challenge=${request.challenge}&mode=poll`;
}

export async function pollBrowserPair(request: BrowserPairRequest): Promise<(ActorConsoleAccount & { token: string }) | null> {
  if (request.expiresAt <= Date.now()) throw new Error("Browser sign-in expired. Start sign-in again.");
  const response = await fetch(`${ACTORCONSOLE_DEVICE_API}/poll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "omit",
    cache: "no-store",
    body: JSON.stringify({ verifier: request.verifier }),
    signal: AbortSignal.timeout(8_000),
  });
  const body = await response.json() as {
    ok?: boolean;
    data?: ActorConsoleAccount & { token?: string; status?: string };
    error?: { message?: string };
  };
  if (!response.ok || !body.ok) throw new Error(body.error?.message ?? "Could not check browser sign-in.");
  if (body.data?.status === "pending") return null;
  if (!body.data?.token || !/^acx_[a-f0-9]{64}$/.test(body.data.token)) {
    throw new Error("ActorConsole returned an invalid browser credential. Start sign-in again.");
  }
  return body.data as ActorConsoleAccount & { token: string };
}
