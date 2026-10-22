/* eslint-disable @next/next/no-html-link-for-pages -- Native anchors intentionally exercise the compatibility router. */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installInternalLinks } from "./internal-links";
import { NavigationProvider, usePathname, scrollToFragment, navigate } from "./navigation";
import Link from "./link";
import { navigateInApp } from "../lib/client-navigation";
import { ItemsPerPageSelect } from "../components/ui/items-per-page";

let removeLinks: (() => void) | undefined;
beforeEach(() => window.history.replaceState({}, "", "/signup"));
afterEach(() => {
  removeLinks?.();
  removeLinks = undefined;
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

function CurrentRoute() {
  return <p data-testid="route">{usePathname()}</p>;
}

it.each(["/dashboard/revenue", "/admin/users"])(
  "retains scroll for filters and pagination on %s, then resets for a new page",
  (pathname) => {
    window.history.replaceState({}, "", pathname);
    const scroll = vi.spyOn(window, "scrollTo");
    navigate(`${pathname}?q=maps`);
    navigate(`${pathname}?q=maps&page=2`);
    expect(scroll).not.toHaveBeenCalled();
    navigate("/dashboard/costs");
    expect(scroll).toHaveBeenCalledOnce();
    expect(scroll).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
  },
);

it("keeps the same document and shell for imperative pagination and extension redirects", () => {
  removeLinks = installInternalLinks((path) => ["/docs", "/signup"].includes(path));
  render(
    <NavigationProvider>
      <header data-testid="shell">Shared shell</header>
      <CurrentRoute />
    </NavigationProvider>,
  );
  const shell = screen.getByTestId("shell");
  const length = window.history.length;
  act(() => navigateInApp("/docs?limit=100"));
  expect(screen.getByTestId("shell")).toBe(shell);
  expect(screen.getByTestId("route").textContent).toBe("/docs");
  expect(window.location.search).toBe("?limit=100");
  expect(window.history.length).toBe(length + 1);
  act(() => navigateInApp("/signup", true));
  expect(screen.getByTestId("shell")).toBe(shell);
  expect(screen.getByTestId("route").textContent).toBe("/signup");
  expect(window.history.length).toBe(length + 1);
});

it("changes the real page-size control through the router while retaining its shared shell", () => {
  window.history.replaceState({}, "", "/builders?page=3&sort=users");
  removeLinks = installInternalLinks((path) => path === "/builders");
  render(
    <NavigationProvider>
      <header data-testid="shell">Shared shell</header>
      <ItemsPerPageSelect value={25} />
    </NavigationProvider>,
  );
  const shell = screen.getByTestId("shell");
  fireEvent.change(screen.getByRole("combobox", { name: "Items per page" }), {
    target: { value: "100" },
  });
  expect(window.location.pathname).toBe("/builders");
  expect(window.location.search).toBe("?sort=users&limit=100");
  expect(screen.getByTestId("shell")).toBe(shell);
});

it("uses client navigation for a plain internal HTML anchor including a cross-page fragment", async () => {
  removeLinks = installInternalLinks((path) => path === "/docs");
  render(
    <NavigationProvider>
      <CurrentRoute />
      <a href="/docs#billing">
        <span>Read the guide</span>
      </a>
    </NavigationProvider>,
  );
  // Happy DOM activates anchors before document bubbling; isolate the delegated
  // click handler from that simulated native action. Chrome verifies real clicks.
  const event = new Event("click", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "button", { value: 0 });
  act(() => screen.getByText("Read the guide").dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(window.location.pathname).toBe("/docs");
  expect(window.location.hash).toBe("#billing");
  expect(screen.getByTestId("route").textContent).toBe("/docs");
});

it("uses client navigation for a React Link to another page's fragment", () => {
  render(
    <NavigationProvider>
      <CurrentRoute />
      <Link href="/docs#billing">Docs section</Link>
    </NavigationProvider>,
  );
  fireEvent.click(screen.getByRole("link"));
  expect(window.location.pathname).toBe("/docs");
  expect(window.location.hash).toBe("#billing");
  expect(screen.getByTestId("route").textContent).toBe("/docs");
});

it("preserves browser behavior for downloads, new tabs, external URLs, feeds and same-page anchors", () => {
  removeLinks = installInternalLinks((path) => path === "/docs");
  window.history.replaceState({}, "", "/docs");
  const links = [
    <a key="download" href="/docs" download>
      Download
    </a>,
    <a key="blank" href="/docs" target="_blank">
      New tab
    </a>,
    <a key="external" href="https://example.com/docs">
      External
    </a>,
    <a key="feed" href="/changelog/feed">
      Feed
    </a>,
    <a key="fragment" href="#billing">
      Section
    </a>,
  ];
  render(<div>{links}</div>);
  for (const link of screen.getAllByRole("link")) {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    let handled = false;
    const preventNativeNavigation = (click: Event) => {
      handled = click.defaultPrevented;
      click.preventDefault();
    };
    document.addEventListener("click", preventNativeNavigation, { once: true });
    link.dispatchEvent(event);
    expect(handled).toBe(false);
  }
});

it("keeps modified clicks native and respects an earlier handler's cancellation", () => {
  removeLinks = installInternalLinks(() => true);
  render(
    <a href="/docs" onClick={(event) => event.preventDefault()}>
      Handled link
    </a>,
  );
  fireEvent.click(screen.getByRole("link"), { ctrlKey: true });
  expect(window.location.pathname).toBe("/signup");
  fireEvent.click(screen.getByRole("link"));
  expect(window.location.pathname).toBe("/signup");
});

it("scrolls to a cross-page fragment after its asynchronously loaded content arrives", async () => {
  const stop = scrollToFragment("#billing");
  const target = document.createElement("section");
  target.id = "billing";
  target.scrollIntoView = vi.fn();
  document.body.append(target);
  await waitFor(() => expect(target.scrollIntoView).toHaveBeenCalledOnce());
  stop?.();
  target.remove();
});

it("routes a native GET filter form without reloading and preserves repeated field values", () => {
  removeLinks = installInternalLinks((path) => path === "/docs");
  render(
    <NavigationProvider>
      <CurrentRoute />
      <form aria-label="Filter" action="/docs?old=value" method="get">
        <input name="q" defaultValue="billing" />
        <input name="category" defaultValue="a" />
        <input name="category" defaultValue="b" />
        <button type="submit" name="view" value="compact">
          Apply
        </button>
      </form>
    </NavigationProvider>,
  );
  const form = screen.getByRole("form");
  const event = new SubmitEvent("submit", {
    bubbles: true,
    cancelable: true,
    submitter: screen.getByRole("button"),
  });
  act(() => form.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(window.location.pathname).toBe("/docs");
  expect(new URLSearchParams(window.location.search).get("q")).toBe("billing");
  expect(new URLSearchParams(window.location.search).getAll("category")).toEqual(["a", "b"]);
  expect(new URLSearchParams(window.location.search).get("old")).toBeNull();
  expect(new URLSearchParams(window.location.search).get("view")).toBe("compact");
});

it("leaves POST forms to their existing handlers", () => {
  removeLinks = installInternalLinks(() => true);
  render(
    <form aria-label="Save" action="/docs" method="post">
      <button>Save</button>
    </form>,
  );
  const event = new SubmitEvent("submit", { bubbles: true, cancelable: true });
  let intercepted = false;
  document.addEventListener(
    "submit",
    (submitted) => {
      intercepted = submitted.defaultPrevented;
      submitted.preventDefault();
    },
    { once: true },
  );
  screen.getByRole("form").dispatchEvent(event);
  expect(intercepted).toBe(false);
  expect(window.location.pathname).toBe("/signup");
});
