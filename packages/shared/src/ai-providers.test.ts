import { describe, expect, it } from "vitest";
import { AI_PROVIDER_DEFAULTS, AI_PROVIDER_KEYS } from "./ai-providers.js";

describe("AI provider defaults", () => {
  it("seeds the requested editable priority order", () => {
    expect(AI_PROVIDER_KEYS).toEqual([
      "opencode_free",
      "opencode_paid",
      "kilocode",
      "gemini_ai_studio",
      "openrouter",
      "openai",
    ]);
    expect(
      AI_PROVIDER_DEFAULTS.map(({ key, priority, enabled }) => ({ key, priority, enabled })),
    ).toEqual([
      { key: "opencode_free", priority: 10, enabled: false },
      { key: "opencode_paid", priority: 20, enabled: false },
      { key: "kilocode", priority: 30, enabled: false },
      { key: "gemini_ai_studio", priority: 40, enabled: false },
      { key: "openrouter", priority: 50, enabled: false },
      { key: "openai", priority: 60, enabled: false },
    ]);
  });

  it("requires credentials for every provider, including free models", () => {
    expect(AI_PROVIDER_DEFAULTS.every((provider) => provider.requiresCredential)).toBe(true);
  });

  it("uses the expected OpenAI-compatible models and endpoints", () => {
    expect(AI_PROVIDER_DEFAULTS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "opencode_free",
          model: "mimo-v2.5-free",
          baseUrl: "https://opencode.ai/zen/v1/chat/completions",
        }),
        expect.objectContaining({ key: "kilocode", model: "google/gemini-3.6-flash" }),
        expect.objectContaining({ key: "gemini_ai_studio", model: "gemini-3.6-flash" }),
      ]),
    );
  });
});
