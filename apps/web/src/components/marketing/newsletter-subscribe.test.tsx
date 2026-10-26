import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewsletterSubscribe } from "./newsletter-subscribe";
import { NewsletterCta } from "./newsletter-cta";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("newsletter states", () => {
  it("retains its pending action name and announces success", async () => {
    let finish!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
    );
    render(<NewsletterSubscribe />);
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "audit@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Subscribe" }).closest("form")!);
    expect(
      (screen.getByRole("button", { name: /Subscribing/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () => finish({ ok: true, json: async () => ({ ok: true }) }));
    expect(screen.getByRole("status").textContent).toContain("Check your inbox");
  });
  it("keeps the email for retry after a connection failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
    render(<NewsletterSubscribe />);
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "audit@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Subscribe" }).closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toContain("Could not connect");
    expect((screen.getByPlaceholderText("you@example.com") as HTMLInputElement).value).toBe(
      "audit@example.com",
    );
  });
  it("provides a real privacy policy link beside the subscription form", () => {
    render(<NewsletterCta />);
    expect(screen.getByRole("link", { name: "privacy policy" }).getAttribute("href")).toBe(
      "/legal/privacy",
    );
  });
});
