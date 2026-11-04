"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Bell, Bot, Calendar, DollarSign, Info, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { NOTIFICATION_TIME_GROUPS, notificationDateReader } from "@/lib/notification-dates";
import { NotificationLink } from "./notification-link";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  detailHref: string;
  readAt: string | null;
  createdAt: string;
  source?: "actorconsole" | "apify";
}

function typeIcon(type: string) {
  if (type.toLowerCase().startsWith("apify:")) return Bell;
  return (
    (
      {
        review: Bot,
        schedule: Calendar,
        revenue: DollarSign,
        billing: DollarSign,
        security: Shield,
      } as Record<string, typeof Info>
    )[type.toLowerCase()] ?? Info
  );
}

export function NotificationList({ items }: { items: NotificationItem[] }) {
  // Server HTML uses dated records without guessing the reader's local day.
  const [clock, setClock] = useState<{ now: Date; timeZone: string } | null>(null);
  useEffect(() => {
    const update = () =>
      setClock({ now: new Date(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    update();
    const timer = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const readDate = clock ? notificationDateReader(clock.now, clock.timeZone) : null;
  const datedItems = items.map((item) => ({ ...item, date: readDate?.(item.createdAt) }));
  const groups = clock
    ? NOTIFICATION_TIME_GROUPS.map((title) => ({
        title,
        records: datedItems.filter((item) => item.date?.group === title),
      })).filter((group) => group.records.length)
    : [{ title: "Notifications", records: datedItems }];

  return (
    <div className="divide-y divide-border/30">
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h4 className="px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.title}
          </h4>
          {group.records.map((item) => {
            const Icon = typeIcon(item.type);
            return (
              <NotificationLink
                key={item.id}
                id={item.id}
                href={item.detailHref}
                unread={!item.readAt}
              >
                <div
                  className={`flex items-start gap-3 px-4 py-4 transition-colors hover:bg-accent/30 sm:gap-4 sm:px-5 ${!item.readAt ? "bg-signal-orange/[0.02]" : ""}`}
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="min-w-0 break-words text-sm font-medium">{item.title}</p>
                      {item.source === "apify" ? (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          Apify
                        </Badge>
                      ) : null}
                      {!item.readAt ? (
                        <span className="text-[10px] font-medium text-signal-orange">Unread</span>
                      ) : null}
                      <time
                        dateTime={item.createdAt}
                        title={
                          clock
                            ? new Date(item.createdAt).toLocaleString(undefined, {
                                timeZone: clock.timeZone,
                              })
                            : item.createdAt
                        }
                        className="text-xs text-muted-foreground"
                      >
                        {item.date?.relative ?? `${item.createdAt.slice(0, 10)} UTC`}
                      </time>
                    </div>
                    {item.body ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {item.body}
                      </p>
                    ) : null}
                    <span className="mt-2 inline-flex items-center gap-1 text-xs text-signal-orange">
                      View notification <ArrowRight aria-hidden="true" className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </NotificationLink>
            );
          })}
        </section>
      ))}
    </div>
  );
}
