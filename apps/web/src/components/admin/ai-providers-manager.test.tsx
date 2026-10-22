import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/admin/api", () => ({ api: (...args: unknown[]) => mocks.api(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

import { AiProvidersManager, type AiProviderView, type AiProxyView } from "./ai-providers-manager";

const provider: AiProviderView = {
  id: "provider_1",
  key: "openai",
  type: "openai",
  autoDisableOnError: true,
  disabledAt: null,
  disabledReason: null,
  name: "OpenAI",
  enabled: true,
  priority: 1,
  model: "gpt-test",
  baseUrl: "https://api.example.com/chat",
  useProxy: false,
  lastTestedAt: null,
  testStatus: null,
  testMessage: null,
  updatedAt: "2026-08-19T00:00:00.000Z",
  readiness: {
    ready: true,
    credentialReady: true,
    proxyReady: true,
    credentialCount: 1,
  },
  credentials: [
    {
      id: "credential_1",
      label: "Primary account",
      enabled: true,
      isConfigured: true,
      lastUsedAt: null,
      cooldownUntil: null,
      authErrorAt: null,
      lastTestedAt: null,
      testStatus: null,
      testMessage: null,
      updatedAt: "2026-08-19T00:00:00.000Z",
    },
  ],
};

const proxy: AiProxyView = {
  protocol: "http",
  host: "proxy.example.com",
  port: 8000,
  username: "actorconsole",
  passwordConfigured: true,
  lastTestedAt: null,
  testStatus: null,
  testMessage: null,
};

describe("AiProvidersManager", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("confirms before removing an AI credential", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(<AiProvidersManager providers={[provider]} proxy={proxy} />);

    fireEvent.click(screen.getByText("Settings and API keys"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Primary account" }));
    expect(mocks.api).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Remove API key?" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove API key" }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/admin/ai-providers/openai/credentials/credential_1",
        { method: "DELETE" },
      ),
    );
  });

  it("confirms before clearing the shared proxy password", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(<AiProvidersManager providers={[]} proxy={proxy} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear password" }));
    expect(mocks.api).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Clear proxy password?" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear password" }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/admin/ai-providers/proxy", {
        method: "PUT",
        body: JSON.stringify({
          protocol: "http",
          host: "proxy.example.com",
          port: 8000,
          username: "actorconsole",
          clearPassword: true,
        }),
      }),
    );
  });

  it("offers editable OpenCode Free model suggestions", () => {
    render(
      <AiProvidersManager
        providers={[
          { ...provider, key: "opencode_free", type: "opencode_free", name: "OpenCode Free" },
        ]}
        proxy={proxy}
      />,
    );

    fireEvent.click(screen.getByText("Settings and API keys"));
    const modelInput = screen.getByLabelText("Model");
    expect(modelInput.getAttribute("list")).toBe("opencode_free-model-options");
    expect(screen.getByText(/mimo-v2\.5-free or big-pickle/)).toBeTruthy();
  });

  it("saves OpenCode settings without client impersonation controls or fields", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(
      <AiProvidersManager
        providers={[
          { ...provider, key: "opencode_free", type: "opencode_free", name: "OpenCode Free" },
        ]}
        proxy={proxy}
      />,
    );
    fireEvent.click(screen.getByText("Settings and API keys"));
    expect(screen.queryByLabelText("User-Agent")).toBeNull();
    expect(screen.queryByLabelText("x-opencode-session")).toBeNull();
    expect(screen.queryByRole("switch", { name: /Send OpenCode headers/ })).toBeNull();
    expect(screen.queryByText(/Free requests can run without a key/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalled());
    const body = JSON.parse(mocks.api.mock.calls[0][1].body);
    expect(body.useProxy).toBe(false);
    for (const field of [
      "useOpenCodeHeaders",
      "openCodeClient",
      "openCodeUserAgent",
      "openCodeSessionId",
      "openCodeProjectId",
    ]) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it("requires an API key before enabling a new free provider", () => {
    render(<AiProvidersManager providers={[]} proxy={proxy} />);
    fireEvent.change(screen.getByLabelText("New provider name"), { target: { value: "Free" } });
    fireEvent.click(screen.getByRole("switch", { name: "Enable on add" }));
    expect(
      (screen.getByRole("button", { name: "Add provider" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("adds another Gemini entry with separate settings and a write-only key", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(<AiProvidersManager providers={[]} proxy={proxy} />);
    fireEvent.change(screen.getByLabelText("Provider type"), {
      target: { value: "gemini_ai_studio" },
    });
    fireEvent.change(screen.getByLabelText("New provider name"), {
      target: { value: "Gemini backup" },
    });
    fireEvent.change(screen.getByLabelText(/New provider API key/), {
      target: { value: "secret-gemini-key" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Enable on add" }));
    fireEvent.click(screen.getByRole("button", { name: "Add provider" }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalled());
    expect(mocks.api.mock.calls[0][0]).toBe("/admin/ai-providers");
    expect(JSON.parse(mocks.api.mock.calls[0][1].body)).toMatchObject({
      type: "gemini_ai_studio",
      name: "Gemini backup",
      enabled: true,
      apiKey: "secret-gemini-key",
    });
    await waitFor(() =>
      expect((screen.getByLabelText(/New provider API key/) as HTMLInputElement).value).toBe(""),
    );
  });

  it("sorts duplicate provider types by instance identity", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(
      <AiProvidersManager
        providers={[
          provider,
          { ...provider, id: "provider_2", key: "openai-backup", name: "OpenAI backup" },
        ]}
        proxy={proxy}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Lower" })[0]);
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/admin/ai-providers/reorder", {
        method: "PUT",
        body: JSON.stringify({ keys: ["openai-backup", "openai"] }),
      }),
    );
  });

  it("shows why a provider was automatically disabled and permits re-enabling it", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(
      <AiProvidersManager
        providers={[
          {
            ...provider,
            enabled: false,
            disabledAt: "2026-10-01T00:00:00Z",
            disabledReason: "Provider returned HTTP 403: Access denied",
          },
        ]}
        proxy={proxy}
      />,
    );
    expect(screen.getByText("Automatically disabled")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Access denied");
    fireEvent.click(screen.getByRole("switch", { name: "Enable OpenAI" }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/admin/ai-providers/openai", {
        method: "PUT",
        body: JSON.stringify({ enabled: true }),
      }),
    );
  });

  it("confirms before removing a provider and its keys", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(<AiProvidersManager providers={[provider]} proxy={proxy} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove provider OpenAI" }));
    expect(mocks.api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove provider" }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith("/admin/ai-providers/openai", { method: "DELETE" }),
    );
  });

  it("refreshes the saved status after a failed provider test", async () => {
    mocks.api.mockResolvedValueOnce({
      ok: false,
      error: { message: "Provider returned HTTP 403" },
    });
    render(<AiProvidersManager providers={[provider]} proxy={proxy} />);
    fireEvent.click(screen.getByRole("button", { name: "Test provider" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Provider returned HTTP 403"));
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
