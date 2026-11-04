type ListingField = "title" | "description" | "pictureUrl";

export interface ActorListingSource {
  title?: string | null;
  description?: string | null;
  pictureUrl?: string | null;
  listingMetadataAvailable?: Partial<Record<ListingField, boolean>>;
}

/** Compact owned-Actor inventories omit listing fields; only explicit values
 * (including null removals) may replace a previously verified listing. */
export function actorListingUpdate(actor: ActorListingSource) {
  const available = (field: ListingField) =>
    actor.listingMetadataAvailable?.[field] !== false && actor[field] !== undefined;
  return {
    ...(available("title") ? { title: actor.title } : {}),
    ...(available("description")
      ? { description: actor.description, hasDescription: Boolean(actor.description?.trim()) }
      : {}),
    ...(available("pictureUrl") ? { currentImageUrl: actor.pictureUrl } : {}),
  };
}
