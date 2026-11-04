import { describe, expect, it } from "vitest";
import { notificationTimeGroup, notificationRelativeTime } from "./notification-dates";
import { clampPageSize, normalizePageSize } from "./page-size";

describe("notification dates and page sizes", () => {
  it("uses the reader's day in India and across midnight", () => {
    expect(
      notificationTimeGroup(
        "2026-11-03T21:30:00Z",
        new Date("2026-11-04T10:52:00Z"),
        "Asia/Kolkata",
      ),
    ).toBe("Today");
    expect(
      notificationTimeGroup(
        "2026-11-04T18:00:00Z",
        new Date("2026-11-04T19:00:00Z"),
        "Asia/Kolkata",
      ),
    ).toBe("Yesterday");
    expect(
      notificationTimeGroup("2026-11-04T18:00:00Z", new Date("2026-11-04T19:00:00Z"), "UTC"),
    ).toBe("Today");
  });
  it("handles 23 and 25 hour DST days by calendar date and invalid/future times", () => {
    expect(
      notificationTimeGroup(
        "2026-03-08T05:30:00Z",
        new Date("2026-03-09T04:15:00Z"),
        "America/New_York",
      ),
    ).toBe("Yesterday");
    expect(
      notificationTimeGroup(
        "2026-11-01T04:30:00Z",
        new Date("2026-11-02T05:15:00Z"),
        "America/New_York",
      ),
    ).toBe("Yesterday");
    expect(notificationTimeGroup("invalid", new Date(), "UTC")).toBe("Older");
    expect(notificationRelativeTime("invalid", new Date(), "UTC")).toBe("Date unavailable");
    expect(notificationRelativeTime("2027-01-01", new Date("2026-11-04"), "UTC")).toBe("Just now");
  });
  it("supports ten and custom values and honors the inbox API cap without reducing other lists", () => {
    expect(normalizePageSize("10")).toBe(10);
    expect(normalizePageSize("72")).toBe(72);
    expect(clampPageSize(200, 100)).toBe(100);
    expect(clampPageSize(500)).toBe(500);
    expect(clampPageSize("2.5", 100)).toBeNull();
  });
});
