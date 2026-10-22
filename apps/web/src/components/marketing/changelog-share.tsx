"use client";
import { useState } from "react";
import { Link as LinkIcon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ChangelogShare() {
  const [message, setMessage] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            setMessage("Link copied");
          } catch {
            setMessage("Copy the page address from your browser to share this update.");
          }
        }}
      >
        {message === "Link copied" ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <LinkIcon className="mr-2 h-4 w-4" />
        )}
        Copy link
      </Button>
      <span role="status" className="text-muted-foreground text-xs">
        {message}
      </span>
    </div>
  );
}
