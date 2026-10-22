# Admin AI provider entries

The AI providers page manages independent entries. Add any number of OpenCode Free, OpenCode Paid, Gemini AI Studio, OpenRouter, OpenAI or KiloCode entries, each with its own name, model, endpoint, API keys and optional proxy settings. Existing entries and encrypted credentials are preserved.

New entries start disabled unless **Enable on add** is selected. An API key is required to enable every type, including OpenCode Free. Keys are encrypted and remain write-only. **Higher** and **Lower** sort the full list; priority 1 is attempted first. Disabled entries are skipped. Removing an entry also removes its saved credentials.

**Automatically disable on access or billing errors** defaults to on. HTTP 401, 402, 403, 404 and 410 disable the entry. HTTP 400/429 errors explicitly reporting insufficient quota, billing/credit failures, restricted free access or unsupported models also disable it. Compatible gateways that return an error object with HTTP 200 are checked too. The current request falls through to the next enabled entry, and subsequent requests skip the disabled entry. The page shows the saved failure reason.

Ordinary rate limits cool down the affected key; transport failures, timeouts and server errors remain retryable. Invalid generated content falls through without disabling the entry. Request time is shared across the priority list so a hanging endpoint leaves time for fallbacks. If every entry fails, the router returns its existing unavailable error.

To recover, correct the endpoint/model or replace the API key, test the provider, then enable it again. A successful provider/key test clears the tested credential's authentication quarantine and cooldown. Testing alone does not enable a provider. Disabling automatic deactivation retains the existing key rotation behavior for authentication failures.

Provider calls send standard JSON and Bearer authentication headers. There are no CLI identity, project, session or custom User-Agent settings, anonymous requests or dummy keys. Configure your own API key using the provider's supported API. For OpenCode Zen, see the [official API setup](https://docs.opencode.ai/docs/zen/).

Optional proxy routing uses the exact configured endpoint and credentials, including the username on retries. ActorConsole does not generate proxy sessions or rotate exit identities.

Before deploying, run `pnpm db:migrate` to apply all pending Prisma migrations, including `20261022090000_remove_ai_client_impersonation`, then regenerate the client with `pnpm db:generate`. The new migration drops the five obsolete OpenCode header columns and disables free entries without an eligible credential. Add an API key and enable those entries explicitly. Existing historical migrations are retained so deployed databases can upgrade normally. Deploy the updated web, API and any worker/MCP services that consume the AI package together.
