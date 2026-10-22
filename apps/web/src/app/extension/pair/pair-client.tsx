"use client";

import Link from "next/link";
import Image from "next/image";
import { signOut } from "@/lib/session-client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CircleCheck, Loader2, Monitor, Puzzle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "@/lib/api-base";

type PairState = "review" | "authorizing" | "waiting" | "connected" | "error" | "cancelled";
type Props = {
  challenge: string;
  delivery?: "bridge" | "poll";
  account: { name?: string | null; email?: string | null };
};

export function ExtensionPairClient({ challenge, delivery = "bridge", account }: Props) {
  const [state, setState] = useState<PairState>("review");
  const [error, setError] = useState("");
  const [pairingId, setPairingId] = useState<string | null>(null);
  const busy = useRef(false);
  const callbackUrl = `/extension/pair?challenge=${challenge}${delivery === "poll" ? "&mode=poll" : ""}`;

  useEffect(() => {
    if (delivery !== "bridge" || state !== "waiting") return;
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data;
      if (message?.source !== "actorconsole-extension" || message.type !== "PAIR_RESULT" ||
        message.payload?.challenge !== challenge) return;
      if (message.payload?.ok) setState("connected");
      else {
        setError(message.payload?.error ?? "The extension could not finish sign-in. Try again.");
        setState("error");
      }
    }
    window.addEventListener("message", onMessage);
    const timeout = setTimeout(() => {
      setError("The extension did not respond. Reopen its sidebar and start sign-in again.");
      setState("error");
    }, 30_000);
    return () => { window.removeEventListener("message", onMessage); clearTimeout(timeout); };
  }, [challenge, delivery, state]);

  useEffect(() => {
    if (!pairingId || state !== "waiting") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 5 * 60_000;
    async function check() {
      try {
        const response = await fetch(`${API_BASE_URL}/extension-device/pair/status?id=${encodeURIComponent(pairingId!)}`, {
          credentials: "include", cache: "no-store", signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error?.message ?? "Could not confirm the browser connection.");
        if (body.data.status === "connected") { setState("connected"); return; }
        if (body.data.status === "expired" || Date.now() >= deadline) {
          setError("This connection expired. Start sign-in again from the extension sidebar.");
          setState("error"); return;
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (Date.now() >= deadline) {
          setError(cause instanceof Error ? cause.message : "Could not confirm the connection. Start sign-in again.");
          setState("error"); return;
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void check(), 2_000);
    }
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [pairingId, state]);

  async function authorize() {
    if (busy.current) return;
    busy.current = true;
    setError("");
    setState("authorizing");
    try {
      const response = await fetch(`${API_BASE_URL}/extension-device/pair`, {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
        body: JSON.stringify({ challenge, delivery }), signal: AbortSignal.timeout(15_000),
      });
      const body = await response.json();
      if (!response.ok || !body.ok || !body.data?.pairingId || (delivery === "bridge" && !body.data.code)) {
        throw new Error(body.error?.message ?? "Could not authorize this browser. Try again.");
      }
      setPairingId(body.data.pairingId);
      setState("waiting");
      if (delivery === "bridge") {
        window.postMessage({ source: "actorconsole-web", type: "PAIR_COMPLETE", payload: { challenge, code: body.data.code } }, window.location.origin);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not authorize this browser. Try again.");
      setState("error");
    } finally { busy.current = false; }
  }

  const waiting = state === "authorizing" || state === "waiting";
  const finished = state === "connected" || state === "cancelled";

  return (
    <main className="bg-background flex min-h-[100dvh] flex-col">
      <header className="border-border flex h-16 shrink-0 items-center border-b px-6 sm:px-10">
        <Link href="/" className="font-display flex items-center gap-3 text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Image src="/favicon-96x96.png" alt="" width={28} height={28} unoptimized />ActorConsole
        </Link>
      </header>
      <div className="mx-auto flex w-full max-w-lg flex-1 items-center px-6 py-12 sm:py-20">
        <section className="w-full" aria-labelledby="connect-heading">
          <div className="mb-8 flex items-center gap-4" aria-hidden="true">
            <Image src="/favicon-96x96.png" alt="" width={48} height={48} unoptimized />
            <ArrowRight className="text-muted-foreground size-5" />
            {state === "connected" ? <CircleCheck className="text-signal-green size-10" /> : <Monitor className="size-10" />}
          </div>
          <h1 id="connect-heading" className="font-display text-3xl leading-tight sm:text-4xl">
            {state === "connected" ? "Browser connected" : state === "cancelled" ? "Connection cancelled" : "Connect this browser"}
          </h1>
          <p className="text-muted-foreground mt-4 text-sm leading-6">
            {state === "connected" ? "You’re signed in to the ActorConsole extension. You can close this tab and return to the sidebar to connect your Apify account."
              : state === "cancelled" ? "This browser was not authorized. You can close this tab or start sign-in again from the extension."
                : "The ActorConsole Chrome extension is requesting access to your account. Review the account below, then authorize the connection."}
          </p>

          {state !== "cancelled" && (
            <div className="border-border my-8 border-y py-5">
              <p className="text-muted-foreground text-xs">{state === "connected" ? "Connected as" : "Signed in as"}</p>
              <p className="mt-1 break-words font-medium">{account.name || account.email || "Your ActorConsole account"}</p>
              {account.name && account.email && <p className="text-muted-foreground mt-1 break-all text-sm">{account.email}</p>}
              {!finished && !waiting && <button type="button" className="text-foreground mt-3 rounded-sm text-sm underline underline-offset-4 hover:text-signal-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void signOut({ redirectTo: `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` })}>Use a different account</button>}
            </div>
          )}

          {!finished && (
            <>
              <div className="mb-8 flex gap-3 text-sm leading-6">
                <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <p>The extension can view your workspaces and manage the Apify connections you choose. You can revoke access by disconnecting in the extension sidebar.</p>
              </div>
              {state === "error" && <p role="alert" className="text-destructive mb-5 text-sm leading-6">{error}</p>}
              {waiting ? (
                <div role="status" className="flex gap-3 text-sm leading-6">
                  <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  <p>{state === "authorizing" ? "Authorizing this browser…" : "Authorized. Waiting for the extension to finish sign-in. Keep its sidebar open; it will update automatically."}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button type="button" size="lg" className="w-full sm:flex-1" onClick={() => void authorize()}><Puzzle />{state === "error" ? "Try again" : "Authorize browser"}</Button>
                  <Button type="button" size="lg" variant="outline" onClick={() => setState("cancelled")}>Cancel</Button>
                </div>
              )}
            </>
          )}
          {finished && <div role="status" className="mt-8">
            {state === "connected" && <p className="mb-5 flex items-center gap-2 text-sm"><Check className="text-signal-green size-4" aria-hidden="true" />The extension has confirmed your connection.</p>}
            <Button asChild variant="outline"><Link href="/dashboard">Go to dashboard<ArrowRight /></Link></Button>
          </div>}
          <p className="text-muted-foreground mt-10 text-xs leading-5">Only authorize a connection you started from your extension.</p>
        </section>
      </div>
    </main>
  );
}
