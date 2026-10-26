"use client";

import { API_BASE_URL } from "@/lib/api-base";
/**
 * Newsletter subscription bar — embedded in the marketing footer.
 *
 * Client component: shows an email input + subscribe button.
 * On submit, calls POST /api/newsletter/subscribe.
 */
import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Mail, CheckCircle, Loader2 } from "lucide-react";

export function NewsletterSubscribe() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || isPending) return;
    setError(null);

    startTransition(async () => {
      try {
        const API = API_BASE_URL;
        const res = await fetch(`${API}/newsletter/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();

        if (res.ok && data.ok) {
          setSubscribed(true);
          toast.success(data.message ?? "Subscribed! Check your inbox.");
        } else {
          const message = data.error?.message ?? "Something went wrong.";
          setError(message);
          toast.error(message);
        }
      } catch {
        setError("Could not connect. Please try again.");
        toast.error("Could not connect. Please try again.");
      }
    });
  }

  if (subscribed) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 text-center">
        <div className="bg-secondary/60 flex h-12 w-12 items-center justify-center rounded-full">
          <CheckCircle className="text-foreground h-5 w-5" />
        </div>
        <p className="text-foreground text-sm font-medium">
          You&apos;re in! Check your inbox to confirm.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="flex w-full items-stretch gap-2">
      <div className="relative min-w-0 flex-1">
        <Mail className="text-slate absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
          className="border-border h-12 rounded-md pl-10 text-[15px]"
          required
        />
      </div>
      <Button type="submit" size="lg" disabled={isPending} className="shrink-0 px-6">
        {isPending ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Subscribing…</> : "Subscribe"}
      </Button>
      </div>
      {error ? <p role="alert" className="text-destructive mt-2 text-sm">{error}</p> : null}
    </form>
  );
}
