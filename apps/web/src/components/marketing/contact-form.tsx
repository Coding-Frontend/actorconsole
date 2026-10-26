"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Send } from "lucide-react";
import { API_BASE_URL } from "@/lib/api-base";

export function ContactForm() {
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "support",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending.current) return;
    if (!formData.name || !formData.email || !formData.message) {
      toast.error("Please fill in all required fields.");
      return;
    }

    const submitted = formData;
    pending.current = true;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/contact`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(submitted),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Your message could not be delivered");
      }
      toast.success("Your message was delivered.");
      setFormData((current) => current === submitted ? {
        name: "",
        email: "",
        subject: "support",
        message: "",
      } : current);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Your message could not be delivered";
      setError(message);
      toast.error(message);
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name" className="text-foreground text-xs font-semibold">
          Full Name *
        </Label>
        <Input
          id="name"
          type="text"
          placeholder="John Doe"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
          maxLength={100}
          className="border-border bg-card focus-visible:ring-signal-orange"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-foreground text-xs font-semibold">
          Email Address *
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="john@example.com"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          required
          maxLength={320}
          className="border-border bg-card focus-visible:ring-signal-orange"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="subject" className="text-foreground text-xs font-semibold">
          Subject
        </Label>
        <select
          id="subject"
          value={formData.subject}
          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring border-border bg-card focus:border-signal-orange focus:ring-signal-orange flex h-10 w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors focus:ring-1 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="support">Technical Support</option>
          <option value="billing">Billing & Pricing</option>
          <option value="partnerships">Partnerships</option>
          <option value="other">General Inquiry</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="message" className="text-foreground text-xs font-semibold">
          Message *
        </Label>
        <Textarea
          id="message"
          placeholder="How can we help you?"
          rows={5}
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          required
          minLength={10}
          maxLength={10_000}
          className="border-border bg-card focus-visible:ring-signal-orange min-h-[120px]"
        />
      </div>

      {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}
      <Button
        type="submit"
        className="mt-2 w-full"
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            Send Message
          </>
        )}
      </Button>
    </form>
  );
}
