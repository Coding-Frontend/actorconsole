import { describe, expect, it } from "vitest";
import { isBulkScheduleActorEligible, isPrivateActor } from "./bulk-publishing-types";

const privateActor = {
  storeIsPublic: false,
  storeIsDeprecated: false,
  storeNotice: "NONE",
};

describe("isPrivateActor", () => {
  it("accepts private Actors", () => {
    expect(isPrivateActor(privateActor)).toBe(true);
  });

  it.each([
    { storeIsPublic: false, storeIsDeprecated: true, storeNotice: "NONE" },
    { storeIsPublic: false, storeIsDeprecated: false, storeNotice: "UNDER_MAINTENANCE" },
  ])("keeps overlapping lifecycle flags eligible %#", (actor) => {
    expect(isPrivateActor(actor)).toBe(true);
  });

  it.each([
    { storeIsPublic: true, storeIsDeprecated: false, storeNotice: "NONE" },
    { storeIsPublic: null, storeIsDeprecated: false, storeNotice: "NONE" },
  ])("rejects public or unavailable visibility %#", (actor) => {
    expect(isPrivateActor(actor)).toBe(false);
  });
});

describe("isBulkScheduleActorEligible", () => {
  it.each(["PENDING", "QUOTA_BLOCKED"])("keeps %s in the automatic queue", (status) => {
    expect(isBulkScheduleActorEligible(status)).toBe(true);
  });

  it.each(["PUBLISHED", "BLOCKED", "FAILED"])(
    "moves %s aside until explicitly retried",
    (status) => {
      expect(isBulkScheduleActorEligible(status)).toBe(false);
    },
  );
});
