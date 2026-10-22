import fetch, { type RequestInit, type Response } from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import {
  coolDownAiCredential,
  claimAiRoutingCredentials,
  disableAiRoutingProvider,
  getAiRoutingProviders,
  getAiRoutingProxy,
  quarantineAiCredential,
  type AiRoutingCredential,
  type AiRoutingProvider,
  type AiRoutingProxy,
} from "@actorconsole/db";
import {
  getLogger,
  incrementMetric,
  observeMetric,
  type AiProviderKey,
} from "@actorconsole/shared";

const log = getLogger("ai:text-router");
const ATTEMPT_TIMEOUT_MS = 120_000;
const ROUTER_TIMEOUT_MS = 180_000;
const MAX_ATTEMPTS_PER_PROVIDER = 2;

export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

export interface AiTextRequest<T> extends CompletionOptions {
  prompt: string;
  parse: (text: string) => T;
}

export class AiProviderUnavailableError extends Error {
  readonly code = "ai_provider_unavailable";

  constructor(
    readonly retryable: boolean,
    message = "No configured AI provider could complete the request",
  ) {
    super(message);
    this.name = "AiProviderUnavailableError";
  }
}

class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter: string | null = null,
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

function configuredProxyUrl(proxy: AiRoutingProxy): string {
  const url = new URL(`${proxy.protocol}://${proxy.host}:${proxy.port}`);
  url.username = proxy.username;
  url.password = proxy.password;
  return url.toString();
}

function isOpenCodeProvider(provider: AiRoutingProvider): boolean {
  return provider.type === "opencode_free" || provider.type === "opencode_paid";
}

function isPermanentProviderError(error: unknown): boolean {
  if (!(error instanceof ProviderRequestError)) return false;
  if ([401, 402, 403, 404, 410].includes(error.status)) return true;
  return (
    [400, 429].includes(error.status) &&
    /insufficient[_ ](?:quota|credits?)|billing[_ ](?:error|required|not[_ ]active|hard[_ ]limit|disabled)|payment required|(?:credit|account) balance|out of credits|freeusage(?:limit)?error|free[_ ]?user.*error|free(?:[- ]tier| usage).*?(?:only|not allowed|not supported|restricted)|model (?:is )?(?:unavailable|not found|does not exist|not supported)|unknown model|unsupported model/i.test(
      error.message,
    )
  );
}

async function deactivateOnPermanentError(
  provider: AiRoutingProvider,
  error: unknown,
): Promise<boolean> {
  if (!provider.autoDisableOnError || !isPermanentProviderError(error)) return false;
  const message = error instanceof Error ? error.message : "Provider access failed";
  try {
    await disableAiRoutingProvider(provider.id, message);
  } catch {
    log.error({ providerId: provider.id }, "Could not persist automatic AI provider deactivation");
  }
  return true;
}

function jsonErrorDetail(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const parsed = data as {
    error?: { message?: unknown; code?: unknown; type?: unknown; status?: unknown } | unknown;
    message?: unknown;
  };
  const detail =
    parsed.error !== null && typeof parsed.error === "object" && "message" in parsed.error
      ? (parsed.error as { message?: unknown }).message
      : parsed.message;
  const providerError =
    parsed.error && typeof parsed.error === "object"
      ? (parsed.error as { code?: unknown; type?: unknown; status?: unknown })
      : null;
  const code = providerError?.code ?? providerError?.type ?? providerError?.status;
  if (typeof detail === "string" && detail.trim()) {
    return `${typeof code === "string" ? `${code}: ` : ""}${detail.trim()}`.slice(0, 500);
  }
  return typeof parsed.error === "string" ? parsed.error.slice(0, 500) : "";
}

async function providerErrorDetail(response: Response): Promise<string> {
  const body = (await response.text()).trim();
  if (!body) return "";
  try {
    const detail = jsonErrorDetail(JSON.parse(body));
    if (detail) return detail;
  } catch {
    // Keep a short raw response for non-JSON provider errors.
  }
  return body.replace(/\s+/g, " ").slice(0, 500);
}

function responseText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "";
  const content = (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : "",
      )
      .join("")
      .trim();
  }
  return "";
}

async function requestProvider(
  provider: AiRoutingProvider,
  credential: AiRoutingCredential | null,
  proxy: AiRoutingProxy | null,
  request: CompletionOptions & { prompt: string },
  timeoutMs: number,
): Promise<string> {
  if (!credential?.apiKey.trim()) throw new Error("No enabled API key configured");
  if (provider.useProxy && !proxy) throw new Error("Proxy is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${credential.apiKey}`,
  };
  const reasoningOpenAi =
    provider.type === "openai" && /^(?:gpt-[56]|o[1-9])(?:[-.]|$)/.test(provider.model);
  const init: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: provider.model,
      messages: [
        ...(request.system ? [{ role: "system", content: request.system }] : []),
        { role: "user", content: request.prompt },
      ],
      ...(provider.type === "openai"
        ? { max_completion_tokens: request.maxTokens ?? 4096 }
        : { max_tokens: request.maxTokens ?? 4096 }),
      ...(!reasoningOpenAi
        ? { temperature: request.temperature ?? 0.7 }
        : { reasoning_effort: "low" }),
      stream: false,
      ...(isOpenCodeProvider(provider) ? { reasoning_effort: "none" } : {}),
    }),
    signal: controller.signal,
    ...(proxy ? { agent: new HttpsProxyAgent(configuredProxyUrl(proxy)) } : {}),
  };

  try {
    const response = await fetch(provider.baseUrl, init);
    if (!response.ok) {
      const rawDetail = await providerErrorDetail(response);
      const detail = credential ? rawDetail.replaceAll(credential.apiKey, "[redacted]") : rawDetail;
      throw new ProviderRequestError(
        `Provider returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
        response.status,
        response.headers.get("retry-after"),
      );
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ProviderRequestError("Provider returned malformed JSON", 422);
    }
    // Some compatible gateways report API errors inside an HTTP 200 body.
    if (data && typeof data === "object" && "error" in data && data.error) {
      const detail = jsonErrorDetail(data);
      const error =
        typeof data.error === "object"
          ? (data.error as { code?: unknown; status?: unknown })
          : null;
      const numericStatus = Number(error?.code);
      const status =
        numericStatus >= 400 && numericStatus <= 599
          ? numericStatus
          : error?.status === "PERMISSION_DENIED"
            ? 403
            : error?.status === "UNAUTHENTICATED"
              ? 401
              : error?.status === "RESOURCE_EXHAUSTED"
                ? 429
                : 400;
      throw new ProviderRequestError(
        credential ? detail.replaceAll(credential.apiKey, "[redacted]") : detail,
        status,
      );
    }
    const text = responseText(data);
    if (!text) throw new ProviderRequestError("Provider returned an empty response", 422);
    return text;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderRequestError("Provider request timed out", 408);
    }
    throw new ProviderRequestError(error instanceof Error ? error.message : String(error), 503);
  } finally {
    clearTimeout(timer);
  }
}

function retryAfterDate(value: string | null): Date {
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return new Date(Date.now() + seconds * 1_000);
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()) && date > new Date()) return date;
  }
  return new Date(Date.now() + 5 * 60_000);
}

async function attemptCredentials(provider: AiRoutingProvider): Promise<AiRoutingCredential[]> {
  const credentials = await claimAiRoutingCredentials(provider.id, MAX_ATTEMPTS_PER_PROVIDER);
  // A single account may be retried once for transient transport/server errors.
  // Authentication and rate-limit failures never reuse that same account.
  return credentials.length === 1 ? [credentials[0]!, credentials[0]!] : credentials;
}

export async function completeAiText<T>(request: AiTextRequest<T>): Promise<T> {
  const startedAt = Date.now();
  const deadline = startedAt + ROUTER_TIMEOUT_MS;
  const [providers, proxy] = await Promise.all([getAiRoutingProviders(), getAiRoutingProxy()]);
  if (providers.length === 0) {
    incrementMetric("actorconsole_ai_provider_exhausted_total", { reason: "not_configured" });
    throw new AiProviderUnavailableError(
      false,
      "AI generation is unavailable because no enabled provider has a usable credential",
    );
  }
  let attemptedRequest = false;
  let retryableFailure = false;

  for (const [providerIndex, provider] of providers.entries()) {
    if (Date.now() >= deadline) break;
    if (provider.useProxy && !proxy) {
      incrementMetric("actorconsole_ai_provider_skipped_total", {
        provider: provider.key,
        reason: "proxy_not_configured",
      });
      continue;
    }
    const credentials = await attemptCredentials(provider);
    for (const [attemptIndex, credential] of credentials.entries()) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      const attemptStartedAt = performance.now();
      try {
        attemptedRequest = true;
        const text = await requestProvider(
          provider,
          credential,
          provider.useProxy ? proxy : null,
          request,
          // Reserve time for lower-priority entries when an endpoint hangs.
          Math.min(
            ATTEMPT_TIMEOUT_MS,
            Math.floor(
              remainingMs /
                ((providers.length - providerIndex) * MAX_ATTEMPTS_PER_PROVIDER - attemptIndex),
            ),
          ),
        );
        const parsed = request.parse(text);
        incrementMetric("actorconsole_ai_provider_requests_total", {
          provider: provider.key,
          model: provider.model,
          credential_id: credential.id,
          status: "success",
        });
        observeMetric(
          "actorconsole_ai_provider_request_duration_seconds",
          (performance.now() - attemptStartedAt) / 1_000,
          {
            provider: provider.key,
            model: provider.model,
            credential_id: credential.id,
            status: "success",
          },
        );
        log.info(
          {
            provider: provider.key,
            model: provider.model,
            credentialId: credential.id,
            durationMs: Math.round(performance.now() - attemptStartedAt),
          },
          "AI provider request completed",
        );
        return parsed;
      } catch (error) {
        const status = error instanceof ProviderRequestError ? error.status : 422;
        const message = error instanceof Error ? error.message : String(error);
        if (credential && status === 429) {
          await coolDownAiCredential(
            credential.id,
            retryAfterDate(error instanceof ProviderRequestError ? error.retryAfter : null),
          ).catch(() => undefined);
          incrementMetric("actorconsole_ai_provider_cooldowns_total", {
            provider: provider.key,
            model: provider.model,
            credential_id: credential.id,
          });
        }
        if (credential && (status === 401 || status === 403)) {
          await quarantineAiCredential(
            credential.id,
            `Provider authentication failed (${status})`,
          ).catch(() => undefined);
        }
        incrementMetric("actorconsole_ai_provider_requests_total", {
          provider: provider.key,
          model: provider.model,
          credential_id: credential.id,
          status: "failure",
          http_status: status,
        });
        observeMetric(
          "actorconsole_ai_provider_request_duration_seconds",
          (performance.now() - attemptStartedAt) / 1_000,
          {
            provider: provider.key,
            model: provider.model,
            credential_id: credential.id,
            status: "failure",
          },
        );
        log.warn(
          {
            provider: provider.key,
            model: provider.model,
            credentialId: credential.id,
            status,
            error: message.slice(0, 1_000),
          },
          "AI provider request failed; trying fallback",
        );

        if (await deactivateOnPermanentError(provider, error)) break;
        const retryable = status === 408 || status === 429 || status >= 500;
        if (retryable) retryableFailure = true;
        const authFailure = status === 401 || status === 403;
        const nextCredential = credentials[attemptIndex + 1];
        const wouldReuseCredential = credential !== null && nextCredential?.id === credential.id;
        if (!retryable && !authFailure) break;
        if (wouldReuseCredential && (status === 429 || authFailure)) break;
      }
    }
    incrementMetric("actorconsole_ai_provider_fallbacks_total", {
      provider: provider.key,
      model: provider.model,
    });
  }

  incrementMetric("actorconsole_ai_provider_exhausted_total", {
    reason: retryableFailure
      ? "transient_failures"
      : attemptedRequest
        ? "invalid_response"
        : "unusable",
  });
  throw new AiProviderUnavailableError(
    retryableFailure,
    retryableFailure
      ? "AI providers are temporarily unavailable; the request will be retried"
      : attemptedRequest
        ? "Configured AI providers could not produce a valid response"
        : "AI generation is unavailable because configured providers cannot currently be used",
  );
}

export async function testAiProviderConnection(
  provider: AiRoutingProvider,
  credential: AiRoutingCredential | null,
  proxy: AiRoutingProxy | null,
): Promise<string> {
  try {
    const text = await requestProvider(
      provider,
      credential,
      provider.useProxy ? proxy : null,
      {
        prompt: 'Reply with exactly {"ok":true}',
        system: "Return valid JSON only.",
        // Leave room for reasoning before the final JSON content.
        maxTokens: provider.type === "openai" ? 2048 : 256,
        temperature: 0,
      },
      30_000,
    );
    const parsed = parseJsonResponse(text) as { ok?: unknown };
    if (parsed?.ok !== true) throw new Error("Provider returned an unexpected test response");
    return `${provider.name} responded successfully with ${provider.model}.`;
  } catch (error) {
    await deactivateOnPermanentError(provider, error);
    throw error;
  }
}

export async function testAiProxyConnection(proxy: AiRoutingProxy): Promise<string> {
  const response = await fetch("https://api.ipify.org?format=json", {
    agent: new HttpsProxyAgent(configuredProxyUrl(proxy)),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Proxy returned HTTP ${response.status}`);
  const data = (await response.json()) as { ip?: unknown };
  if (typeof data.ip !== "string" || !data.ip) throw new Error("Proxy test returned no exit IP");
  return `Connected through proxy exit IP ${data.ip}.`;
}

export function extractJsonObject(value: string): string {
  let cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  if (start < 0) return cleaned;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return cleaned.slice(start, index + 1);
  }
  return cleaned;
}

export function parseJsonResponse(value: string): unknown {
  return JSON.parse(extractJsonObject(value));
}

export type { AiProviderKey };
