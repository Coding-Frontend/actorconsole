import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Link from "next/link";
import { navigateInApp } from "@/lib/client-navigation";
import { CatalogDocumentNavigation } from "./catalog-document-navigation";

vi.mock("@/lib/client-navigation", () => ({ navigateInApp: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("loads a complete document when leaving the catalog renderer", () => {
  const view = render(
    <>
      <CatalogDocumentNavigation />
      <Link href="/docs">
        <span>Docs</span>
      </Link>
    </>,
  );
  view
    .getByText("Docs")
    .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  expect(navigateInApp).toHaveBeenCalledWith("/docs");
});

it("preserves modified clicks, downloads, and external links", () => {
  const view = render(
    <>
      <CatalogDocumentNavigation />
      <Link href="/docs">Docs</Link>
      <a href="/export.csv" download>
        Download
      </a>
      <a href="https://apify.com" target="_blank">
        Apify
      </a>
    </>,
  );
  for (const [text, modifiers] of [
    ["Docs", { ctrlKey: true }],
    ["Docs", { metaKey: true }],
    ["Download", {}],
    ["Apify", {}],
  ] as const) {
    view.getByText(text).dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        ...modifiers,
      }),
    );
  }
  expect(navigateInApp).not.toHaveBeenCalled();
});
