import type { Prisma } from "@prisma/client";
import { db } from "./client.js";

/** Keep recommendations in step with Actor assignments, including logos that
 * were activated before an Actor was imported. Preserve Apply/Dismiss choices. */
export async function reconcileActorLogoRecommendations(
  where: Prisma.ActorWhereInput = {},
  client: Prisma.TransactionClient = db,
) {
  let cursor: string | undefined;
  let created = 0;
  while (true) {
    const actors = await client.actor.findMany({
      where,
      orderBy: { id: "asc" },
      take: 250,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        apifyRemovedAt: true,
        websiteIdentity: {
          select: {
            status: true,
            currentLogo: { select: { id: true, reviewStatus: true } },
          },
        },
      },
    });
    if (!actors.length) break;

    const groups = new Map<string | null, string[]>();
    for (const actor of actors) {
      const website = actor.websiteIdentity;
      const logoId =
        !actor.apifyRemovedAt &&
        website?.status === "ACTIVE" &&
        website.currentLogo?.reviewStatus === "APPROVED"
          ? website.currentLogo.id
          : null;
      const ids = groups.get(logoId) ?? [];
      ids.push(actor.id);
      groups.set(logoId, ids);
    }

    for (const [logoId, actorIds] of groups) {
      await client.actorLogoRecommendation.updateMany({
        where: {
          actorId: { in: actorIds },
          status: "PENDING",
          ...(logoId ? { logoId: { not: logoId } } : {}),
        },
        data: { status: "SUPERSEDED", error: null },
      });
      if (!logoId) continue;
      // A reassignment or logo rollback can make a superseded version current
      // again. Explicitly dismissed and already applied versions stay closed.
      await client.actorLogoRecommendation.updateMany({
        where: { actorId: { in: actorIds }, logoId, status: "SUPERSEDED" },
        data: { status: "PENDING", error: null },
      });
      const result = await client.actorLogoRecommendation.createMany({
        data: actorIds.map((actorId) => ({ actorId, logoId })),
        skipDuplicates: true,
      });
      created += result.count;
    }
    cursor = actors.at(-1)!.id;
  }
  return { created };
}

/** The part of the Apify client that publishing a logo needs. */
export type LogoPublishingClient = {
  updateActorMetadata(
    apifyActorId: string,
    input: { picture: { fileName: string; contentType: string; body: Uint8Array } },
  ): Promise<{ verified: boolean; pictureUrl: string | null }>;
};

export class LogoApplyError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "logo_recommendation_in_progress"
      | "logo_recommendation_superseded"
      | "apify_publishing_credentials_required"
      | "apify_logo_update_failed",
    message: string,
    readonly status: 404 | 409 | 502,
  ) {
    super(message);
  }
}

/** An APPLYING claim older than this belongs to a request or worker that died. */
export const STALE_LOGO_APPLY_MS = 10 * 60_000;

export const LOGO_APPLY_UNCONFIRMED_MESSAGE =
  "Could not confirm whether this logo reached Apify. Check the Actor on Apify, then apply again if needed.";

/**
 * Apply one recommendation to Apify. The row is claimed with a conditional
 * update first, so double clicks, two tabs, or a bulk job and a manual click
 * can never upload the same logo twice. A failure returns the row to PENDING
 * with the error so it can be retried.
 */
export async function applyActorLogoRecommendation(input: {
  recommendationId: string;
  /** Workspace and API-key scope the recommendation's Actor must match. */
  actorWhere: Prisma.ActorWhereInput;
  /** Claim a QUEUED row owned by this bulk batch instead of a PENDING one. */
  batchId?: string;
  getApify: () => Promise<LogoPublishingClient | null>;
  readLogo: (storagePath: string) => Promise<Uint8Array>;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  const claim = await db.actorLogoRecommendation.updateMany({
    where: {
      id: input.recommendationId,
      actor: { ...input.actorWhere, apifyRemovedAt: null },
      OR: input.batchId
        ? [{ status: "QUEUED", batchId: input.batchId }]
        : [
            { status: "PENDING" },
            { status: "APPLYING", updatedAt: { lt: new Date(now().getTime() - STALE_LOGO_APPLY_MS) } },
          ],
    },
    data: { status: "APPLYING", error: null },
  });
  if (!claim.count) {
    const existing = await db.actorLogoRecommendation.findFirst({
      where: { id: input.recommendationId, actor: input.actorWhere },
      select: { status: true },
    });
    if (existing && ["APPLYING", "QUEUED"].includes(existing.status)) {
      throw new LogoApplyError(
        "logo_recommendation_in_progress",
        "This logo is already being applied. Refresh in a moment to see the result.",
        409,
      );
    }
    throw new LogoApplyError("not_found", "Logo recommendation not found", 404);
  }

  const release = (data: Prisma.ActorLogoRecommendationUpdateManyMutationInput) =>
    db.actorLogoRecommendation.updateMany({
      where: { id: input.recommendationId, status: "APPLYING" },
      data,
    });

  const item = await db.actorLogoRecommendation.findUniqueOrThrow({
    where: { id: input.recommendationId },
    include: {
      actor: { include: { websiteIdentity: { select: { status: true, currentLogoId: true } } } },
      logo: true,
    },
  });
  if (
    item.actor.websiteIdentityId !== item.logo.websiteIdentityId ||
    item.actor.websiteIdentity?.status !== "ACTIVE" ||
    item.actor.websiteIdentity.currentLogoId !== item.logoId ||
    item.logo.reviewStatus !== "APPROVED"
  ) {
    await release({ status: "SUPERSEDED", error: null });
    throw new LogoApplyError(
      "logo_recommendation_superseded",
      "This logo recommendation is no longer current. Refresh the logo recommendations.",
      409,
    );
  }

  let apify: LogoPublishingClient | null;
  try {
    apify = await input.getApify();
  } catch (error) {
    await release({ status: "PENDING", error: errorText(error) });
    throw error;
  }
  if (!apify) {
    await release({
      status: "PENDING",
      error: "Apify publishing credentials are unavailable or expired",
    });
    throw new LogoApplyError(
      "apify_publishing_credentials_required",
      "Reconnect your Apify publishing credential before applying this logo",
      409,
    );
  }

  let pictureUrl: string;
  try {
    const bytes = await input.readLogo(item.logo.storagePath);
    const extension = item.logo.contentType === "image/png" ? "png" : "webp";
    const result = await apify.updateActorMetadata(item.actor.apifyActorId, {
      picture: {
        fileName: `${item.logo.checksum.slice(0, 16)}.${extension}`,
        contentType: item.logo.contentType,
        body: bytes,
      },
    });
    if (!result.verified || !result.pictureUrl) {
      throw new Error("Apify did not verify the updated thumbnail. Try applying the logo again.");
    }
    pictureUrl = result.pictureUrl;
  } catch (error) {
    const message = errorText(error, "Apify rejected the logo update");
    await release({ status: "PENDING", error: message });
    throw new LogoApplyError("apify_logo_update_failed", message, 502);
  }

  // Apify has the new picture now. Recording it must not be reported as an
  // Apify failure, so a local write error leaves the claim to expire instead.
  await db.$transaction([
    db.actor.update({ where: { id: item.actorId }, data: { currentImageUrl: pictureUrl } }),
    db.actorLogoRecommendation.update({
      where: { id: item.id },
      data: { status: "APPLIED", appliedAt: now(), error: null },
    }),
  ]);
  return { pictureUrl, actorId: item.actorId, logoId: item.logoId };
}

function errorText(error: unknown, fallback = "Unexpected error") {
  return (error instanceof Error ? error.message : fallback).slice(0, 65_535);
}

/** Outcome of one recommendation in a bulk apply batch, for progress views. */
export function logoBatchItemOutcome(item: { status: string; error: string | null }) {
  if (item.status === "APPLIED") return "applied" as const;
  if (item.status === "QUEUED") return "queued" as const;
  if (item.status === "APPLYING") return "running" as const;
  return "failed" as const;
}
