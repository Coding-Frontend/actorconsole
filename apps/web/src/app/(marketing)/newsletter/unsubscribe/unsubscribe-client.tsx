"use client";

import { API_BASE_URL } from "@/lib/api-base";
import { useState, useEffect, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/lib/session-client";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Sparkles, CheckCircle, XCircle, Loader2 } from "lucide-react";

export function UnsubscribeClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { status: sessionStatus } = useSession();

  const [status, setStatus] = useState<"loading" | "success" | "error" | "idle">(
    token ? "loading" : "idle",
  );
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!token) return;
    const API = API_BASE_URL;
    fetch(`${API}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setStatus("success");
          setMessage(data.message ?? "You've been unsubscribed.");
        } else {
          setStatus("error");
          setMessage(data.error?.message ?? "Invalid unsubscribe link.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Could not process your request. Please try again.");
      });
  }, [token]);

  function handleManualUnsubscribe() {
    const API = API_BASE_URL;
    startTransition(async () => {
      try {
        const res = await fetch(`${API}/newsletter/unsubscribe`, {
          method: "POST",
          credentials: "include",
        });
        const data = await res.json();
        if (data.ok) {
          setStatus("success");
          setMessage(data.message ?? "You've been unsubscribed.");
        } else {
          setStatus("error");
          setMessage(data.error?.message ?? "Could not unsubscribe.");
        }
      } catch {
        setStatus("error");
        setMessage("Could not connect. Please try again.");
      }
    });
  }

  return (
    <Panel variant="default" radius="none" className="blueprint-frame w-full max-w-md">
      <div className="space-y-4 text-center">
        {status === "loading" && (
          <>
            <Loader2 className="text-signal-blue mx-auto h-8 w-8 animate-spin" />
            <p className="text-muted-foreground text-sm">Processing your request…</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="bg-signal-green/10 mx-auto flex h-12 w-12 items-center justify-center rounded-full">
              <CheckCircle className="text-signal-green h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Unsubscribed</h1>
              <p className="text-muted-foreground mt-2 text-sm">{message}</p>
            </div>
            <p className="text-muted-foreground text-xs">
              You will no longer receive newsletter emails from ActorConsole.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="bg-destructive/10 mx-auto flex h-12 w-12 items-center justify-center rounded-full">
              <XCircle className="text-destructive h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Something went wrong</h1>
              <p className="text-muted-foreground mt-2 text-sm">{message}</p>
            </div>
          </>
        )}

        {status === "idle" && (
          <>
            <div className="bg-signal-blue/10 mx-auto flex h-12 w-12 items-center justify-center rounded-full">
              <Sparkles className="text-signal-blue h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Unsubscribe from Newsletter</h1>
              <p className="text-muted-foreground mt-2 text-sm">
                Use the unsubscribe link from your email, or sign in to manage the subscription for
                your account.
              </p>
            </div>
            {sessionStatus === "authenticated" ? (
              <Button
                onClick={handleManualUnsubscribe}
                disabled={isPending}
                variant="destructive"
                className="w-full"
              >
                {isPending ? "Unsubscribing…" : "Yes, unsubscribe me"}
              </Button>
            ) : sessionStatus === "loading" ? (
              <Button disabled className="w-full">
                Checking account…
              </Button>
            ) : (
              <Button asChild className="w-full">
                <Link
                  href={{ pathname: "/login", query: { callbackUrl: "/newsletter/unsubscribe" } }}
                >
                  Log in to manage subscription
                </Link>
              </Button>
            )}
          </>
        )}

        <Link
          href="/"
          className="text-signal-blue inline-block text-sm font-medium hover:underline"
        >
          Back to homepage
        </Link>
      </div>
    </Panel>
  );
}
