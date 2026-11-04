import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewTicketForm } from "./new-ticket-form";

const state = vi.hoisted(() => ({ push: vi.fn(), workspaceId: "workspace-one" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("./workspace-access-context", () => ({
  useWorkspaceAccess: () => ({
    access: { workspaceId: state.workspaceId },
    loading: false,
    error: false,
    refresh: vi.fn(),
  }),
}));
const actor = {
  id: "actor-one",
  title: "Test Actor",
  actorName: "test-actor",
  apifyActorId: "apify-one",
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  state.push.mockReset();
  state.workspaceId = "workspace-one";
  window.sessionStorage.clear();
});
describe("new support ticket drafts", () => {
  it("restores all fields and Actor selection after leaving; preserves failed submission and clears successful drafts", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error: { message: "Temporary failure" } }), {
          status: 503,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: { id: "ticket-one" } }), { status: 201 }),
      );
    vi.stubGlobal("fetch", fetcher);
    const first = render(<NewTicketForm userId="user-one" actors={[actor]} />);
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Keep my ticket" } });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Keep my full explanation." },
    });
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "HIGH" } });
    fireEvent.change(screen.getByLabelText(/Related Actor/), { target: { value: actor.id } });
    first.unmount();
    render(<NewTicketForm userId="user-one" />);
    expect(screen.getByText("Your saved draft was restored in this tab.")).toBeTruthy();
    expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe("Keep my ticket");
    expect((screen.getByLabelText(/Related Actor/) as HTMLSelectElement).value).toBe(actor.id);
    expect((screen.getByLabelText("Priority") as HTMLSelectElement).value).toBe("HIGH");
    fireEvent.click(screen.getByRole("button", { name: "Open ticket" }));
    await screen.findByText("Temporary failure");
    expect(
      window.sessionStorage.getItem("actorconsole:support-draft:user-one:workspace-one"),
    ).toContain("Keep my ticket");
    fireEvent.click(screen.getByRole("button", { name: "Open ticket" }));
    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/dashboard/support/ticket-one"));
    expect(fetcher.mock.calls[0][1].headers["x-business-profile-id"]).toBe("workspace-one");
    expect(
      window.sessionStorage.getItem("actorconsole:support-draft:user-one:workspace-one"),
    ).toBeNull();
  });

  it("does not show a previous account or workspace draft after a scope change", () => {
    const view = render(<NewTicketForm userId="user-one" />);
    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: "Private to this workspace" },
    });
    state.workspaceId = "workspace-two";
    view.rerender(<NewTicketForm userId="user-one" />);
    expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe("");
    state.workspaceId = "workspace-one";
    view.rerender(<NewTicketForm userId="user-two" />);
    expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe("");
    view.rerender(<NewTicketForm userId="user-one" />);
    expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe(
      "Private to this workspace",
    );
  });
});
