import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

import { CopyRewriteDialog } from "./copy-rewrite-dialog";

describe("CopyRewriteDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: true,
              data: {
                keywords: ["maps", "leads"],
                variants: [
                  {
                    title: "Google Maps Lead Extractor",
                    description: "Extract business listings and contacts from Google Maps.",
                    seoTitle: "Google Maps Lead Extractor",
                    seoDescription:
                      "Extract Google Maps business listings and contacts for prospecting and research.",
                    reasoning: "The copy matches the Actor's proven use cases.",
                  },
                ],
              },
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, data: { title: "Updated" } }), { status: 200 }),
        ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows copy variants and updates the existing Actor listing without categories", async () => {
    const onChanged = vi.fn();
    render(
      <CopyRewriteDialog
        open
        onOpenChange={vi.fn()}
        onChanged={onChanged}
        apifyActorId="owner~maps-actor"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate variants" }));

    await screen.findByText("Extract business listings and contacts from Google Maps.");
    expect(screen.queryByText("Publish selected")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Variant 1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Update Actor" }));

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Actor listing updated on Apify"),
    );
    const updateCall = vi.mocked(fetch).mock.calls[1];
    expect(updateCall?.[0]).toContain("/actors/owner~maps-actor/copy");
    expect(JSON.parse(String((updateCall?.[1] as RequestInit).body))).toMatchObject({
      title: "Google Maps Lead Extractor",
    });
    expect(JSON.parse(String((updateCall?.[1] as RequestInit).body))).not.toHaveProperty(
      "categories",
    );
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(toastError).not.toHaveBeenCalled();
  });
});
