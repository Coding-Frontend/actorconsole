import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavigationDrawer } from "./navigation-drawer";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  ),
);
function Fixture({ desktopQuery }: { desktopQuery?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open navigation
      </button>
      <NavigationDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="Local navigation"
        desktopQuery={desktopQuery}
      >
        <button type="button" onClick={() => setOpen(false)}>
          Close navigation
        </button>
        <a href="/local">Local destination</a>
      </NavigationDrawer>
    </>
  );
}
describe("mobile navigation lifecycle", () => {
  it("names the modal, dismisses with Escape and restores its opener", async () => {
    render(<Fixture />);
    const opener = screen.getByRole("button", { name: "Open navigation" });
    Object.defineProperty(opener, "getClientRects", { value: () => [{}] });
    opener.focus();
    fireEvent.click(opener);
    expect(
      screen.getByRole("dialog", { name: "Local navigation" }).getAttribute("aria-modal"),
    ).toBe("true");
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
  it.each(["(min-width: 768px)", "(min-width: 1024px)"])(
    "releases its lock when resizing across %s",
    async (query) => {
      let changed!: () => void;
      const media = {
        matches: false,
        addEventListener: vi.fn((_event, callback) => {
          changed = callback;
        }),
        removeEventListener: vi.fn(),
      };
      const matchMedia = vi.fn(() => media);
      vi.stubGlobal("matchMedia", matchMedia);
      render(<Fixture desktopQuery={query} />);
      fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(matchMedia).toHaveBeenCalledWith(query);
      act(() => {
        media.matches = true;
        changed();
      });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(media.removeEventListener).toHaveBeenCalled();
      expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
      media.matches = false;
      fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
      expect(screen.getByRole("dialog")).toBeTruthy();
    },
  );
});
