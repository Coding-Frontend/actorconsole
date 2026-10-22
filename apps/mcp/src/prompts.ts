import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

function userPrompt(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    "optimize_actor_listing",
    {
      title: "Optimize Actor listing",
      description: "Analyze and improve an Actor listing with an explicit review/apply boundary.",
      argsSchema: { apifyActorId: z.string().min(1) },
    },
    async ({ apifyActorId }) =>
      userPrompt(
        `Analyze ${apifyActorId} with analyze_actor. Poll get_actor_optimization_run until proposals are ready. Summarize the score, evidence, and proposed field changes. Do not call apply_actor_changes until I explicitly approve the exact proposal, result IDs, fields, and idempotency key.`,
      ),
  );

  server.registerPrompt(
    "triage_maintenance_actors",
    {
      title: "Triage maintenance Actors",
      description: "Inspect maintenance Actors and report readiness and blockers without mutation.",
      argsSchema: {},
    },
    async () =>
      userPrompt(
        "List maintenance Actors and inspect each Actor's synchronized readiness. If this credential also has usage:read, include latest usage. Group them into ready, needs changes, and blocked. Do not clear maintenance or publish anything.",
      ),
  );

  server.registerPrompt(
    "prepare_publishing_schedule",
    {
      title: "Prepare publishing schedule",
      description: "Prepare a safe, paused, quota-aware publishing schedule.",
      argsSchema: { dailyLimit: z.string().optional() },
    },
    async ({ dailyLimit }) =>
      userPrompt(
        `Review publish-ready Actors and propose an ordered publishing schedule with a daily limit of ${dailyLimit || "5"}. Create it paused with an idempotency key only after I approve the Actor list. Explain blockers and wait for separate approval before resuming or running it.`,
      ),
  );

  server.registerPrompt(
    "review_deprecated_actors",
    {
      title: "Review deprecated Actors",
      description: "Assess whether deprecated Actors should be restored, replaced, or retained.",
      argsSchema: { apifyActorId: z.string().optional() },
    },
    async ({ apifyActorId }) =>
      userPrompt(
        apifyActorId
          ? `Review deprecated Actor ${apifyActorId} with get_actor. If actors:optimize is available, you may also call analyze_actor. Report evidence, risks, and a recommended action. Do not mutate the Actor.`
          : "List deprecated Actors and review their synchronized metadata. Include performance only if usage:read is available. Rank recommended actions and do not mutate any Actor.",
      ),
  );
}
