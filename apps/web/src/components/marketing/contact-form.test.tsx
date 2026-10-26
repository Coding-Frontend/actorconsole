import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactForm } from "./contact-form";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function fill() {
  fireEvent.change(screen.getByLabelText("Full Name *"), { target: { value: "Local Audit" } });
  fireEvent.change(screen.getByLabelText("Email Address *"), {
    target: { value: "audit@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Message *"), { target: { value: "Original message" } });
}
describe("contact send lifecycle", () => {
  it("preserves new unsent edits when the earlier message succeeds", async () => {
    let finish!: (value: unknown) => void;
    const fetcher = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<ContactForm />);
    fill();
    const form = screen.getByLabelText("Message *").closest("form")!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Message *"), { target: { value: "New unsent draft" } });
    await act(async () => finish({ ok: true, json: async () => ({ ok: true }) }));
    expect((screen.getByLabelText("Message *") as HTMLTextAreaElement).value).toBe(
      "New unsent draft",
    );
    const request = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(request[1].body)).message).toBe("Original message");
  });

  it("retains failed drafts for retry and clears an unchanged successful draft", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("Offline"))
        .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }),
    );
    render(<ContactForm />);
    fill();
    fireEvent.submit(screen.getByLabelText("Message *").closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toContain("Offline");
    expect((screen.getByLabelText("Message *") as HTMLTextAreaElement).value).toBe(
      "Original message",
    );
    fireEvent.submit(screen.getByLabelText("Message *").closest("form")!);
    await waitFor(() =>
      expect((screen.getByLabelText("Message *") as HTMLTextAreaElement).value).toBe(""),
    );
  });
});
