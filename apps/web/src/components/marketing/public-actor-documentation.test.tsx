import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicActorDocumentation } from "./public-actor-documentation";

const documentation = {
  readme: null,
  inputSchema: null,
  outputSchema: null,
  ratingBreakdown: { "5": 15, "4": 2 },
  rating: 4.8,
  reviewCount: 17,
  reviews: [],
  reviewError: null,
  sourceUrl: "https://apify.com/builder/example-actor",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PublicActorDocumentation", () => {
  it("keeps aggregate ratings usable when Apify does not expose review text", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(documentation), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            reviews: [],
            reviewError:
              "Apify exposes the aggregate rating publicly, but individual written reviews require a valid owner Console session.",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    renderDocumentation("reviews");

    expect(await screen.findByText("17 ratings on Apify")).toBeTruthy();
    expect(screen.queryByText(/HTTP 404|token is invalid/i)).toBeNull();
    expect(screen.getByRole("link", { name: /view ratings and reviews on Apify/i })).toHaveProperty(
      "href",
      "https://apify.com/builder/example-actor/reviews",
    );
  });

  it("shows a stable error when a documentation endpoint returns an empty response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 502 }));

    renderDocumentation();

    await waitFor(() => {
      expect(screen.getByText("ActorConsole returned HTTP 502")).toBeTruthy();
    });
    expect(screen.queryByText(/Unexpected end of JSON input/i)).toBeNull();
  });
});

function renderDocumentation(
  initialTab?: "readme" | "input" | "output" | "changelog" | "reviews",
) {
  return render(
    <PublicActorDocumentation
      username="builder"
      actorName="example-actor"
      firstPublishedAt="2026-08-01T00:00:00.000Z"
      createdAt="2026-07-01T00:00:00.000Z"
      modifiedAt="2026-08-20T00:00:00.000Z"
      firstSeenAt="2026-08-02T00:00:00.000Z"
      detailsSyncedAt="2026-08-23T00:00:00.000Z"
      lastSeenAt="2026-08-23T00:00:00.000Z"
      apifyUrl="https://apify.com/builder/example-actor"
      initialTab={initialTab}
    />,
  );
}
