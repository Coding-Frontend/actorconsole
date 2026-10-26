import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketReplyBox } from "./ticket-reply-box";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockReset();
});
describe("support replies", () => {
  it("preserves a newer unsent reply after the previous reply succeeds", async () => {
    let finish!: (value: unknown) => void;
    const fetcher = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<TicketReplyBox ticketId="local-ticket" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Original reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Newer reply" } });
    await act(async () => finish({ ok: true }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Newer reply");
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("keeps a failed close confirmation open and retries successfully", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: "Service unavailable" } }),
      })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetcher);
    render(<TicketReplyBox ticketId="local-ticket" />);
    fireEvent.click(screen.getByRole("button", { name: "Close ticket" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Close ticket" }),
    );
    expect((await within(screen.getByRole("dialog")).findByRole("alert")).textContent).toContain(
      "Service unavailable",
    );
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Close ticket" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledOnce();
  });
});
