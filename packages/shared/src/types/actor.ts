export type ApifyActorId = string; // e.g. "username~actor-name" or numeric id

/** Apify owns this taxonomy and may add values independently of our release. */
export type ActorCategory = string;

export interface ActorSummary {
  id: string;
  apifyActorId: ApifyActorId;
  username: string;
  actorName: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  totalRuns: number | null;
  usersTotal: number | null;
  rating: number | null;
  isPublic: boolean;
  categories: ActorCategory[];
}

export interface ActorDetail extends ActorSummary {
  readme: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  pricing: import("./pricing").ActorPricing | null;
  language: import("../apify-helpers").ActorLanguage;
  inputSchema: unknown;
  outputSchema: unknown;
  createdAt: string;
  updatedAt: string;
}
