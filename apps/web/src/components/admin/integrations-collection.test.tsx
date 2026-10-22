import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IntegrationsCollection, type IntegrationItem } from "./integrations-collection";

const items: Record<string, IntegrationItem[]> = {
  ai: [
    {
      key: "openai_api_key",
      label: "OpenAI API key",
      description: "Text generation",
      category: "ai",
      isConfigured: true,
      testStatus: "ok",
      testMessage: null,
      updatedAt: "2026-08-18T00:00:00.000Z",
    },
  ],
  apify: [
    {
      key: "apify_ui_token",
      label: "Apify UI token",
      description: "Console publishing access",
      category: "apify",
      isConfigured: false,
      testStatus: "error",
      testMessage: "Token expired",
      updatedAt: null,
    },
  ],
};

describe("IntegrationsCollection", () => {
  afterEach(cleanup);

  it.each([true, false])(
    "shows an automatic UI token with active cookies (manual key configured: %s)",
    (isConfigured) => {
      render(
        <IntegrationsCollection
          byCategory={{
            apify: [
              {
                ...items.apify[0],
                isConfigured,
                isActive: false,
                activeConsoleCredential: "apify_cookies",
              },
            ],
          }}
        />,
      );

      expect(screen.getByText("Provided by cookies")).toBeTruthy();
      expect(within(screen.getByRole("link")).queryByText("Test failed")).toBeNull();
      expect(screen.queryByText("Token expired")).toBeNull();
      const card = screen.getByRole("link");
      expect(within(card).queryByText("Not configured")).toBeNull();

      fireEvent.change(screen.getByLabelText("Integration status"), {
        target: { value: "failed" },
      });
      expect(screen.queryByRole("link")).toBeNull();
    },
  );

  it("keeps an expired UI key visible when cookies cannot provide authentication", () => {
    render(
      <IntegrationsCollection
        byCategory={{
          apify: [{ ...items.apify[0], isConfigured: true, activeConsoleCredential: null }],
        }}
      />,
    );
    expect(within(screen.getByRole("link")).getByText("Test failed")).toBeTruthy();
    expect(screen.getByText("Token expired")).toBeTruthy();
    expect(screen.queryByText("Provided by cookies")).toBeNull();
  });

  it("searches, filters, and sorts the integration registry", () => {
    render(<IntegrationsCollection byCategory={items} />);

    expect(screen.getByText("OpenAI API key")).toBeTruthy();
    expect(screen.getByText("Apify UI token")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search integrations"), {
      target: { value: "publishing" },
    });
    expect(screen.queryByText("OpenAI API key")).toBeNull();
    expect(screen.getByText("Apify UI token")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search integrations"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Integration status"), {
      target: { value: "verified" },
    });
    expect(screen.getByText("OpenAI API key")).toBeTruthy();
    expect(screen.queryByText("Apify UI token")).toBeNull();

    fireEvent.change(screen.getByLabelText("Integration status"), {
      target: { value: "all" },
    });
    fireEvent.change(screen.getByLabelText("Integration category"), {
      target: { value: "apify" },
    });
    expect(screen.queryByText("OpenAI API key")).toBeNull();
    expect(screen.getByText("Apify UI token")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Sort integrations"), {
      target: { value: "updatedAt" },
    });
    expect((screen.getByLabelText("Sort integrations") as HTMLSelectElement).value).toBe(
      "updatedAt",
    );
  });
});
