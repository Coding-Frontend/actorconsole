export const NOTIFICATION_TIME_GROUPS = ["Today", "Yesterday", "This week", "Older"] as const;
export type NotificationTimeGroup = (typeof NOTIFICATION_TIME_GROUPS)[number];

/** Calendar days in the reader's timezone, including DST boundaries. */
function calendarDay(value: Date, formatter: Intl.DateTimeFormat) {
  const parts = formatter.formatToParts(value);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / 86_400_000;
}

/** Reuse formatters and today's calendar day across a whole inbox render. */
export function notificationDateReader(now: Date, timeZone: string) {
  const dayFormatter = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const dateFormatter = new Intl.DateTimeFormat("en-IN", {
    timeZone,
    month: "short",
    day: "numeric",
  });
  const today = calendarDay(now, dayFormatter);
  return (value: string): { group: NotificationTimeGroup; relative: string } => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return { group: "Older", relative: "Date unavailable" };
    const age = today - calendarDay(date, dayFormatter);
    const group = age <= 0 ? "Today" : age === 1 ? "Yesterday" : age <= 7 ? "This week" : "Older";
    const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
    const relative =
      minutes < 1
        ? "Just now"
        : minutes < 60
          ? `${minutes}m ago`
          : minutes < 1440
            ? `${Math.floor(minutes / 60)}h ago`
            : age < 7
              ? `${Math.max(1, age)}d ago`
              : dateFormatter.format(date);
    return { group, relative };
  };
}

export function notificationTimeGroup(value: string, now: Date, timeZone: string) {
  return notificationDateReader(now, timeZone)(value).group;
}

export function notificationRelativeTime(value: string, now: Date, timeZone: string) {
  return notificationDateReader(now, timeZone)(value).relative;
}
