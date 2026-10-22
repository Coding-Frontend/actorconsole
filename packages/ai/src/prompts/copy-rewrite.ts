import { z } from "zod";
import { completeAiText, parseJsonResponse, type CompletionOptions } from "../lib/text-router";

export const copyVariantSchema = z.object({
  title: z.string().min(1).max(100).describe("Store display title, 30-80 chars ideal"),
  description: z.string().min(1).max(500).describe("Short description, 100-300 chars ideal"),
  seoTitle: z.string().min(1).max(60).describe("SEO title for search engines, 50-60 chars"),
  seoDescription: z.string().min(1).max(160).describe("Meta description, 120-160 chars"),
  reasoning: z.string().describe("Why this copy will rank better"),
});
export type CopyVariant = z.infer<typeof copyVariantSchema>;

export const copyVariantsSchema = z.object({
  variants: z.array(copyVariantSchema).min(1).max(4),
});

export interface RewriteCopyInput {
  actorTitle: string;
  actorDescription: string;
  sourceSummary: string;
  language: "javascript" | "typescript" | "python" | "other";
  keywords: string[];
  competitors?: Array<{ title: string; description: string }>;
}

const SYSTEM_PROMPT = `You are an expert ASO copywriter for the Apify Store. You write copy that ranks for high-intent search terms and converts scrollers into runners.

Rules:
- Title: punchy, includes primary keyword, ≤80 chars
- Description: outcome-first, scannable bullets feel, ≤300 chars ideal
- SEO title: keyword-front-loaded, ≤60 chars
- SEO description: benefit + use case, 120-160 chars
- Marketplace categories are assigned and maintained automatically by Apify. Never generate, suggest, or change categories.
- No emoji. No hype words ("revolutionary", "amazing"). No ALL CAPS.
- Match the actor's actual function — never invent capabilities.
- Output valid JSON matching the schema. No prose outside JSON.`;

export async function rewriteActorCopy(
  input: RewriteCopyInput,
  opts: CompletionOptions = {},
): Promise<CopyVariant[]> {
  const userPrompt = `Rewrite the Apify Store copy for this actor.

CURRENT TITLE: ${input.actorTitle}
CURRENT DESCRIPTION: ${input.actorDescription}
SOURCE SUMMARY: ${input.sourceSummary}
LANGUAGE: ${input.language}
TARGET KEYWORDS: ${input.keywords.join(", ")}
Apify manages marketplace categories; never generate, suggest, or change categories.
${input.competitors?.length ? `\nTOP COMPETITORS:\n${input.competitors.map((c) => `- ${c.title}: ${c.description}`).join("\n")}` : ""}

Generate 3 distinct variants. Each variant should pick a different angle:
1. Outcome-led ("Get X in Y minutes")
2. Use-case led ("For [persona] who needs [outcome]")
3. Feature-led ("[Capability 1], [Capability 2], ...")

Every variant MUST contain all five fields shown below. Do not rename or omit any field.
Return JSON exactly in this shape:
{
  "variants": [
    {
      "title": "...",
      "description": "...",
      "seoTitle": "...",
      "seoDescription": "...",
      "reasoning": "..."
    }
  ]
}`;

  return completeAiText({
    prompt: userPrompt,
    maxTokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.7,
    system: opts.system ?? SYSTEM_PROMPT,
    parse: (text) => copyVariantsSchema.parse(parseJsonResponse(text)).variants,
  });
}
