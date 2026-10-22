import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/admin/api", () => ({ api: (...args: unknown[]) => mocks.api(...args) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

import { BlogEditor } from "./blog-editor";
import { IncidentUpdateForm } from "./incident-update-form";
import { PolicyEditor } from "./policy-editor";

describe("public admin content actions", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("confirms before publishing a policy version", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(
      <PolicyEditor
        slug="TERMS"
        versions={[
          {
            id: "policy_1",
            slug: "TERMS",
            version: "1.0.0",
            status: "DRAFT",
            title: "Terms",
            body: "Policy body",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(mocks.api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Publish policy" }));

    await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
  });

  it("confirms before publishing a blog post", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(<BlogEditor />);

    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "release" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Release" } });
    fireEvent.change(screen.getByLabelText("Content (Markdown)"), {
      target: { value: "Release notes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(mocks.api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Publish post" }));

    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/admin/blog",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("confirms before publishing an incident update", async () => {
    mocks.api.mockResolvedValue({ ok: true, data: {} });
    render(<IncidentUpdateForm id="incident_1" currentStatus="investigating" />);

    fireEvent.change(screen.getByLabelText("Incident update message"), {
      target: { value: "We identified the affected service." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish update" }));
    expect(mocks.api).not.toHaveBeenCalled();
    const publishButtons = screen.getAllByRole("button", { name: "Publish update" });
    fireEvent.click(publishButtons[publishButtons.length - 1]!);

    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith(
        "/admin/incidents/incident_1",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
  });
});
