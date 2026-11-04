import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
                currentCopy: {
                  title: "Old title",
                  description: "Old description",
                  seoTitle: null,
                  seoDescription: null,
                },
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
          new Response(JSON.stringify({ ok: true, data: { title: "Updated", verified: true } }), {
            status: 200,
          }),
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
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
    expect(screen.getByText("Old title")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply selected fields" }));

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Actor listing updated and verified on Apify"),
    );
    const updateCall = vi.mocked(fetch).mock.calls[1];
    expect(updateCall?.[0]).toContain("/actors/owner~maps-actor/copy");
    expect(JSON.parse(String((updateCall?.[1] as RequestInit).body))).toMatchObject({
      title: "Google Maps Lead Extractor",
      expectedCopy: {
        title: "Old title",
        description: "Old description",
        seoTitle: null,
        seoDescription: null,
      },
    });
    expect(JSON.parse(String((updateCall?.[1] as RequestInit).body))).not.toHaveProperty(
      "categories",
    );
    expect(onChanged).toHaveBeenCalledOnce();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("ignores a generation response after the dialog is dismissed and reopened", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
      ),
    );
    const props = { onOpenChange: vi.fn(), apifyActorId: "actor-A" };
    const view = render(<CopyRewriteDialog open {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate variants" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    view.rerender(<CopyRewriteDialog open={false} {...props} />);
    view.rerender(<CopyRewriteDialog open {...props} />);
    await act(async () =>
      finish(
        Response.json({ data: { variants: [{ title: "Discarded result" }], currentCopy: {} } }),
      ),
    );
    expect(screen.queryByText("Discarded result")).toBeNull();
    expect(screen.getByRole("button", { name: "Generate variants" })).toBeTruthy();
  });

  it("keeps the review open when Apify detects a newer listing edit", async () => {
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce(
        Response.json({
          data: {
            variants: [
              {
                title: "New title",
                description: "New description",
                seoTitle: "New SEO",
                seoDescription: "New SEO description",
                reasoning: "Fixture",
              },
            ],
            currentCopy: {
              title: "Old title",
              description: "Old description",
              seoTitle: null,
              seoDescription: null,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: "The Actor changed. Generate fresh variants." } },
          { status: 409 },
        ),
      );
    render(<CopyRewriteDialog open onOpenChange={vi.fn()} apifyActorId="fixture" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate variants" }));
    fireEvent.click(await screen.findByRole("button", { name: /Variant 1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply selected fields" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByLabelText("Proposed title")).toBeTruthy();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("protects an in-flight write against dismissal and sends only checked fields", async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch)
      .mockReset()
      .mockResolvedValueOnce(
        Response.json({
          data: {
            variants: [
              {
                title: "New title",
                description: "New description",
                seoTitle: "New SEO",
                seoDescription: "New SEO description",
                reasoning: "Fixture",
              },
            ],
            currentCopy: {
              title: "Old title",
              description: "Old description",
              seoTitle: null,
              seoDescription: null,
            },
          },
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      );
    const close = vi.fn();
    render(<CopyRewriteDialog open onOpenChange={close} apifyActorId="fixture" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate variants" }));
    fireEvent.click(await screen.findByRole("button", { name: /Variant 1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "SEO description" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply selected fields" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(close).not.toHaveBeenCalled();
    const sent = JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body));
    expect(sent).not.toHaveProperty("seoDescription");
    await act(async () => finish(Response.json({ data: { verified: true } })));
    expect(await screen.findByText("Listing update verified")).toBeTruthy();
  });
});
