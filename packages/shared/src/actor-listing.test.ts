import { describe, expect, it } from "vitest";
import { actorListingUpdate } from "./actor-listing";

describe("actorListingUpdate", () => {
  it("keeps an applied thumbnail and reviewed copy when a compact inventory omits them", () => {
    const saved = { title: "Reviewed title", description: "Reviewed description", currentImageUrl: "https://images.test/applied.webp", hasDescription: true };
    const refreshed = { ...saved, ...actorListingUpdate({ title: null, description: null, pictureUrl: null, listingMetadataAvailable: { title: false, description: false, pictureUrl: false } }) };
    expect(refreshed).toEqual(saved);
  });

  it("clears listing fields when the provider explicitly reports their removal", () => {
    const saved = { title: "Reviewed title", description: "Reviewed description", currentImageUrl: "https://images.test/applied.webp", hasDescription: true };
    expect({ ...saved, ...actorListingUpdate({ title: null, description: null, pictureUrl: null, listingMetadataAvailable: { title: true, description: true, pictureUrl: true } }) }).toEqual({ title: null, description: null, currentImageUrl: null, hasDescription: false });
  });

  it("refreshes supplied fields without changing omitted fields", () => {
    const saved = { title: "Old title", description: "Reviewed description", currentImageUrl: "https://images.test/applied.webp", hasDescription: true };
    expect({ ...saved, ...actorListingUpdate({ title: "New title" }) }).toEqual({ ...saved, title: "New title" });
  });
});
