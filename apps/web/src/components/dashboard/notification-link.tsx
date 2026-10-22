"use client";

import { navigateInApp } from "@/lib/client-navigation";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { API_BASE_URL } from "@/lib/api-base";
import { DASHBOARD_STATUS_CHANGED_EVENT } from "@/components/dashboard/dashboard-navigation";

export function NotificationLink({
  id,
  href,
  unread,
  onNavigate,
  children,
}: {
  id: string;
  href: string;
  unread: boolean;
  onNavigate?: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const external = /^https:\/\//i.test(href);

  async function open(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (unread) {
      await fetch(`${API_BASE_URL}/notifications/${encodeURIComponent(id)}/read`, {
        method: "POST",
        credentials: "include",
      }).catch(() => undefined);
      window.dispatchEvent(new Event(DASHBOARD_STATUS_CHANGED_EVENT));
    }
    onNavigate?.();
    if (external) {
      navigateInApp(href);
    } else {
      router.push(href);
      router.refresh();
    }
  }

  return (
    <a href={href} onClick={open} {...(external ? { rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}
