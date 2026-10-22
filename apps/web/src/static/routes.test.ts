import { describe, expect, it } from "vitest";
import { matchRoute, routeDefinitions } from "./routes";
const routes = routeDefinitions([
  ["../app/page.tsx", "home"],
  ["../app/(dashboard)/dashboard/actors/[id]/page.tsx", "actor"],
  ["../app/(dashboard)/dashboard/actors/improvements/page.tsx", "improvements"],
  ["../app/(marketing)/builders/[username]/actors/[actorName]/page.tsx", "public-actor"],
  ["../app/(marketing)/builders/compare/[...selection]/page.tsx", "comparison"],
]);
describe("static route resolution", () => {
  it("preserves deep links and prefers named pages over Actor IDs", () => {
    expect(matchRoute("/", routes)?.route.load).toBe("home");
    expect(matchRoute("/dashboard/actors/improvements", routes)?.route.load).toBe("improvements");
    expect(matchRoute("/dashboard/actors/actor-123", routes)?.params).toEqual({ id: "actor-123" });
    expect(
      matchRoute("/builders/clockworks/actors/tiktok-comments-scraper", routes)?.params,
    ).toEqual({ username: "clockworks", actorName: "tiktok-comments-scraper" });
  });
  it("retains comparison selections across reloads", () => {
    expect(matchRoute("/builders/compare/clockworks/compass", routes)?.params).toEqual({
      selection: ["clockworks", "compass"],
    });
    expect(matchRoute("/builders/compare", routes)).toBeNull();
  });
  it.each([
    "/missing",
    "/dashboard/actors/invalid%",
    "/dashboard/actors/one%2Ftwo",
    "/dashboard/actors/id/extra",
  ])("rejects malformed or unmatched paths: %s", (path) =>
    expect(matchRoute(path, routes)).toBeNull(),
  );
});
