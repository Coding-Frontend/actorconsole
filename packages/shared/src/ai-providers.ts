export const AI_PROVIDER_KEYS = [
  "opencode_free",
  "opencode_paid",
  "kilocode",
  "gemini_ai_studio",
  "openrouter",
  "openai",
] as const;

export type AiProviderKey = (typeof AI_PROVIDER_KEYS)[number];

export interface AiProviderDefinition {
  key: AiProviderKey;
  name: string;
  enabled: boolean;
  priority: number;
  model: string;
  baseUrl: string;
  requiresCredential: boolean;
}

export const AI_PROVIDER_DEFAULTS: readonly AiProviderDefinition[] = [
  {
    key: "opencode_free",
    name: "OpenCode Free",
    enabled: false,
    priority: 10,
    model: "mimo-v2.5-free",
    baseUrl: "https://opencode.ai/zen/v1/chat/completions",
    requiresCredential: true,
  },
  {
    key: "opencode_paid",
    name: "OpenCode Paid",
    enabled: false,
    priority: 20,
    model: "deepseek-v4-flash",
    baseUrl: "https://opencode.ai/zen/v1/chat/completions",
    requiresCredential: true,
  },
  {
    key: "kilocode",
    name: "KiloCode",
    enabled: false,
    priority: 30,
    model: "google/gemini-3.6-flash",
    baseUrl: "https://api.kilo.ai/api/gateway/chat/completions",
    requiresCredential: true,
  },
  {
    key: "gemini_ai_studio",
    name: "Google Gemini AI Studio",
    enabled: false,
    priority: 40,
    model: "gemini-3.6-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    requiresCredential: true,
  },
  {
    key: "openrouter",
    name: "OpenRouter",
    enabled: false,
    priority: 50,
    model: "openrouter/auto",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    requiresCredential: true,
  },
  {
    key: "openai",
    name: "OpenAI",
    enabled: false,
    priority: 60,
    model: "gpt-5-mini",
    baseUrl: "https://api.openai.com/v1/chat/completions",
    requiresCredential: true,
  },
] as const;

export const AI_PROVIDER_BY_KEY = Object.fromEntries(
  AI_PROVIDER_DEFAULTS.map((provider) => [provider.key, provider]),
) as Record<AiProviderKey, AiProviderDefinition>;

export function isAiProviderKey(value: string): value is AiProviderKey {
  return AI_PROVIDER_KEYS.includes(value as AiProviderKey);
}
