import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeywordComparisonPage } from "./keyword-comparison-page";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const { push, replace } = router;
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const actors = [
  { id: "one/a", username: "one", name: "a", title: "Alpha", monthlyUsers: 120 },
  { id: "two/b", username: "two", name: "b", title: "Beta", monthlyUsers: 80 },
];

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  push.mockClear();
  replace.mockClear();
});

describe("dashboard Actor comparison deep links", () => {
  it("renders selected Actors from the path without session storage and updates the path on removal", () => {
    render(<KeywordComparisonPage selection={["one/a", "two/b"]} initialResults={actors} />);

    expect(screen.getByRole("heading", { name: "Alpha vs Beta" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Actor comparison" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove Alpha from comparison" }));
    expect(push).toHaveBeenCalledWith("/dashboard/keywords/compare/two/b");
  });

  it("moves an old session-only comparison to a shareable path", () => {
    window.sessionStorage.setItem(
      "actorconsole:keyword-comparison",
      JSON.stringify({ keyword: "maps", results: actors, available: actors }),
    );
    render(<KeywordComparisonPage />);

    expect(replace).toHaveBeenCalledWith("/dashboard/keywords/compare/one/a/~two/b?q=maps");
  });
});
