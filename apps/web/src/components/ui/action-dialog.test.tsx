import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfirmDialog, PromptDialog } from "./action-dialog";

afterEach(cleanup);

describe("action dialogs", () => {
  it("keeps a confirmation open and exposes a retryable failure", async () => {
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Delete workspace?"
        description="This cannot be undone."
        onConfirm={() => Promise.reject(new Error("Workspace could not be deleted."))}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Workspace could not be deleted.",
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("closes a prompt only after its action succeeds", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <PromptDialog
        open
        onOpenChange={onOpenChange}
        title="Rename workspace"
        description="Choose a new name."
        label="Workspace name"
        initialValue="Production"
        onConfirm={onConfirm}
      />,
    );

    fireEvent.change(screen.getByLabelText("Workspace name"), {
      target: { value: "Research" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("Research"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
