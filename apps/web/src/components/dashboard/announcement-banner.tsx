"use client";

import { API_BASE_URL } from "@/lib/api-base";
import { useState, useEffect } from "react";
import { Megaphone, X } from "lucide-react";

const API_BASE = API_BASE_URL;

interface Announcement {
  id: string;
  title: string;
  body: string;
  emoji: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  createdAt: string;
}

export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/announcements/active`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.data) setAnnouncement(j.data);
      })
      .catch(() => {});
  }, []);

  function dismiss() {
    if (!announcement) return;
    setDismissed(true);
    fetch(`${API_BASE}/announcements/${announcement.id}/dismiss`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }

  if (!announcement || dismissed) return null;

  return (
    <div className="border-border/40 bg-signal-orange/5 flex items-center gap-3 border-b px-4 py-2.5 text-sm sm:px-6">
      <Megaphone className="text-signal-orange h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <span className="font-semibold">{announcement.title}</span>
        {announcement.body && (
          <span className="text-muted-foreground ml-1.5">{announcement.body}</span>
        )}
        {announcement.linkUrl && (
          <a
            href={announcement.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-signal-orange ml-2 font-medium underline-offset-2 hover:underline"
          >
            {announcement.linkLabel ?? "Learn more"} →
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 rounded-md p-1"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
