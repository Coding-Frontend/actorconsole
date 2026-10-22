import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refresh, push, success, warning, error } = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock("sonner", () => ({ toast: { success, warning, error } }));

import { ApifyConnect } from "./apify-connect";

describe("ApifyConnect", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/dashboard/apify");
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("runs the initial Actor sync after saving an API key", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              apifyUserId: "apify-user-1",
              credentialMode: "API_ONLY",
              validationError: null,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              synced: 50,
              created: 50,
              skipped: 3,
              available: 53,
              limit: 50,
              usage: { upgradeRequired: true },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    render(<ApifyConnect initialStatus={{ connected: false }} />);
    fireEvent.change(screen.getByLabelText("Apify API key (required for publishing)"), {
      target: { value: `apify_api_${"a".repeat(30)}` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect Apify" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/actors/sync"),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(success).toHaveBeenCalledWith(expect.stringContaining("3 more require Pro"));
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("Upgrade to Pro"));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not attempt Actor sync for a Console-only browser session", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          data: { apifyUserId: "apify-user-1", credentialMode: "PUBLISHING_ONLY" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(<ApifyConnect initialStatus={{ connected: false }} />);
    expect(screen.queryByText("UI token")).toBeNull();
    fireEvent.change(
      screen.getByPlaceholderText("Paste the copied /public/authentication/resume cURL"),
      {
        target: {
          value: `curl 'https://console-backend.apify.com/public/authentication/resume' -b 'ApifyRT=${"r".repeat(30)}'`,
        },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Connect Apify" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toEqual({
      cookies: `ApifyRT=${"r".repeat(30)}`,
    });
    expect(success).toHaveBeenCalledWith(
      "Console credential connected. Add an Apify API key to publish Actors and run schedules.",
    );
  });

  it("completes a one-time Chrome extension cookie handoff", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              handoffId: "handoff-1",
              challenge: "challenge-value-that-is-long-enough-123456789",
              expiresAt: new Date(Date.now() + 300_000).toISOString(),
              workspace: { id: "workspace-1", name: "Primary workspace" },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              connected: true,
              apifyUserId: "apify-user-1",
              apifyUsername: "builder",
              apiKeyConfigured: false,
              uiTokenConfigured: false,
              cookiesConfigured: true,
              apiTokenStatus: "NOT_CONFIGURED",
              uiTokenStatus: "NOT_CONFIGURED",
              cookiesStatus: "VALID",
              credentialMode: "PUBLISHING_ONLY",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    render(<ApifyConnect initialStatus={{ connected: false, extensionEnabled: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect with extension" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          source: window,
          origin: window.location.origin,
          data: {
            source: "actorconsole-extension",
            type: "ACTORCONSOLE_APIFY_HANDOFF_COOKIE",
            payload: {
              handoffId: "handoff-1",
              challenge: "challenge-value-that-is-long-enough-123456789",
              apifyRt: "sensitive-refresh-cookie",
              expectedApifyUserId: "aaaaaaaaaaaaaaaaa",
            },
          },
        }),
      );
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const completion = vi.mocked(fetch).mock.calls[1];
    expect(completion?.[0]).toContain("/apify/extension/session/handoff-1/complete");
    expect(JSON.parse(String((completion?.[1] as RequestInit).body))).toEqual({
      challenge: "challenge-value-that-is-long-enough-123456789",
      apifyRt: "sensitive-refresh-cookie",
      expectedApifyUserId: "aaaaaaaaaaaaaaaaa",
    });
    expect(success).toHaveBeenCalledWith(
      "Apify Console connected. Add an API key to load Actors and use API operations.",
    );
    expect(await screen.findByText("Console only")).toBeTruthy();
  });

  it("starts the handoff from the sidebar for an already connected workspace", async () => {
    window.history.replaceState(null, "", "/dashboard/apify?extension=connect");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            handoffId: "handoff-from-sidebar",
            challenge: "challenge-value-that-is-long-enough-123456789",
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
            workspace: { id: "workspace-1", name: "Primary workspace" },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(
      <ApifyConnect
        initialStatus={{
          connected: true,
          apiKeyConfigured: true,
          cookiesConfigured: true,
          extensionEnabled: true,
          credentialMode: "FULL",
        }}
      />,
    );
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          source: window,
          origin: window.location.origin,
          data: { source: "actorconsole-extension", type: "ACTORCONSOLE_APIFY_EXTENSION_READY" },
        }),
      );
    });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/apify/extension/session"),
        expect.objectContaining({ method: "POST", credentials: "include" }),
      ),
    );
    expect(await screen.findByText("Target workspace: Primary workspace")).toBeTruthy();
  });

  it("replaces an expired API key without asking for the healthy Console credential", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              apifyUserId: "apify-user-1",
              apifyUsername: "builder",
              apiKeyConfigured: true,
              uiTokenConfigured: true,
              cookiesConfigured: false,
              apiTokenStatus: "VALID",
              uiTokenStatus: "VALID",
              cookiesStatus: "NOT_CONFIGURED",
              credentialMode: "FULL",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: { synced: 0, skipped: 0 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    render(
      <ApifyConnect
        initialStatus={{
          connected: true,
          apiKeyConfigured: true,
          uiTokenConfigured: true,
          cookiesConfigured: false,
          apiTokenStatus: "EXPIRED",
          uiTokenStatus: "VALID",
          credentialMode: "FULL",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Replace API key" }));
    expect(screen.getByLabelText("Apify API key (required for publishing)")).toBeTruthy();
    expect(screen.queryByText("Console credential (optional)")).toBeNull();
    fireEvent.change(screen.getByLabelText("Apify API key (required for publishing)"), {
      target: { value: `apify_api_${"a".repeat(30)}` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace API key" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const request = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({ token: `apify_api_${"a".repeat(30)}` });
  });

  it("replaces expired cookies without asking for the healthy API key", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            apifyUserId: "apify-user-1",
            apifyUsername: "builder",
            apiKeyConfigured: true,
            uiTokenConfigured: false,
            cookiesConfigured: true,
            apiTokenStatus: "VALID",
            uiTokenStatus: "NOT_CONFIGURED",
            cookiesStatus: "VALID",
            credentialMode: "FULL",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(
      <ApifyConnect
        initialStatus={{
          connected: true,
          apiKeyConfigured: true,
          uiTokenConfigured: false,
          cookiesConfigured: true,
          apiTokenStatus: "VALID",
          cookiesStatus: "EXPIRED",
          credentialMode: "FULL",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Replace cookies" }));
    expect(screen.queryByLabelText(/Apify API key/)).toBeNull();
    fireEvent.change(
      screen.getByPlaceholderText("Paste the copied /public/authentication/resume cURL"),
      {
        target: {
          value: `curl 'https://console-backend.apify.com/public/authentication/resume' -b 'ApifyRT=${"r".repeat(30)}'`,
        },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Replace Console credential" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const request = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      cookies: `ApifyRT=${"r".repeat(30)}`,
    });
  });

  it("shows validation details and confirms before disconnecting", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, data: { disconnected: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(
      <ApifyConnect
        initialStatus={{
          connected: true,
          apiKeyConfigured: true,
          uiTokenConfigured: true,
          apiTokenStatus: "VALID",
          uiTokenStatus: "INVALID",
          credentialMode: "FULL",
          validationError: "The saved Console credential belongs to another organization.",
        }}
      />,
    );

    expect(
      screen.getByText("The saved Console credential belongs to another organization."),
    ).toBeTruthy();
    expect(screen.getByText("API + publishing")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect all Apify credentials" }));
    expect(screen.getByText("Disconnect all Apify credentials?")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect credentials" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/apify/disconnect"),
      expect.objectContaining({ method: "DELETE", credentials: "include" }),
    );
  });

  it("checks credential health on demand", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            connected: true,
            apifyUserId: "apify-user-1",
            username: "builder",
            apiKeyConfigured: true,
            uiTokenConfigured: true,
            cookiesConfigured: false,
            apiTokenStatus: "VALID",
            uiTokenStatus: "VALID",
            credentialMode: "FULL",
            validatedAt: "2026-09-07T12:00:00.000Z",
            validationError: null,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(
      <ApifyConnect
        initialStatus={{
          connected: true,
          apiKeyConfigured: true,
          uiTokenConfigured: true,
          apiTokenStatus: "VALID",
          uiTokenStatus: "VALID",
          credentialMode: "FULL",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Check connection now" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/apify/status?validate=true"),
      expect.objectContaining({ credentials: "include", cache: "no-store" }),
    );
    expect(await screen.findByText(/Last validated: .*UTC/)).toBeTruthy();
    expect(success).toHaveBeenCalledWith("Apify connection checked");
  });
});
