import { describe, expect, it, vi } from "vitest";
import { publishAndRecordActor } from "../src/lib/publication-event.js";

describe("ActorConsole publication events", () => {
  const actor = { runId: "run-1", apifyActorId: "apify-1", username: "alice", actorName: "one" };
  it("records the confirmed publication once per run and Actor", async () => {
    const apify = {
      publishActor: vi.fn().mockResolvedValue({ isPublic: true, username: "alice", name: "one" }),
    };
    const database = { actorPublicationEvent: { upsert: vi.fn().mockResolvedValue({}) } };
    const publishedAt = new Date("2026-10-27T12:00:00Z");
    await publishAndRecordActor(apify as never, database as never, actor, () => publishedAt);
    expect(database.actorPublicationEvent.upsert).toHaveBeenCalledWith({
      where: { runId_apifyActorId: { runId: "run-1", apifyActorId: "apify-1" } },
      create: { ...actor, publishedAt },
      update: {},
    });
  });

  it("does not record an unconfirmed publication", async () => {
    const apify = { publishActor: vi.fn().mockResolvedValue({ isPublic: false }) };
    const database = { actorPublicationEvent: { upsert: vi.fn() } };
    await expect(publishAndRecordActor(apify as never, database as never, actor)).rejects.toThrow(
      "Apify did not confirm",
    );
    expect(database.actorPublicationEvent.upsert).not.toHaveBeenCalled();
  });
});
