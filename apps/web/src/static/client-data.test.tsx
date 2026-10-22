import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { withClientData } from "./client-data";
import { NavigationContext, redirect } from "./navigation";
import { ContentLoadingContext } from "./content-loading";
import { HomeGridSection } from "../components/marketing/home-grid";
afterEach(cleanup);
it.each(["/login", "/login?callbackUrl=/dashboard"])(
  "preserves a private deep link through %s",
  async (target) => {
    window.history.replaceState({}, "", "/dashboard/actors?view=list");
    const Page = withClientData(async () => redirect(target));
    const location = {
      pathname: "/dashboard/actors",
      search: "?view=list",
      params: {},
      version: 0,
    };
    render(
      <NavigationContext.Provider value={location}>
        <Page />
      </NavigationContext.Provider>,
    );
    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(new URLSearchParams(window.location.search).get("callbackUrl")).toBe(
      "/dashboard/actors?view=list",
    );
    window.history.replaceState({}, "", "/");
  },
);
it("discards a previous workspace's data when its slow response arrives later", async () => {
  let finishOld!: (value: React.ReactNode) => void;
  const old = new Promise<React.ReactNode>((resolve) => {
    finishOld = resolve;
  });
  const Page = withClientData(async ({ workspace }: { workspace: string }) =>
    workspace === "old" ? old : <p>New workspace data</p>,
  );
  const location = { pathname: "/dashboard", search: "", params: {}, version: 0 };
  const view = render(
    <NavigationContext.Provider value={location}>
      <Page workspace="old" />
    </NavigationContext.Provider>,
  );
  view.rerender(
    <NavigationContext.Provider value={{ ...location, version: 1 }}>
      <Page workspace="new" />
    </NavigationContext.Provider>,
  );
  await screen.findByText("New workspace data");
  finishOld(<p>Old private data</p>);
  await waitFor(() => expect(screen.queryByText("Old private data")).toBeNull());
  expect(screen.getByText("New workspace data")).toBeTruthy();
});

it("replaces the page skeleton with an inline loader for a slower nested read", async () => {
  let finishPage!: (value: React.ReactNode) => void;
  let finishRows!: (value: React.ReactNode) => void;
  const pageRead = new Promise<React.ReactNode>((resolve) => {
    finishPage = resolve;
  });
  const rowRead = new Promise<React.ReactNode>((resolve) => {
    finishRows = resolve;
  });
  const Rows = withClientData(async () => rowRead);
  const Page = withClientData(async () => pageRead);
  const view = render(
    <NavigationContext.Provider
      value={{ pathname: "/builders", search: "", params: {}, version: 0 }}
    >
      <ContentLoadingContext.Provider value={<h1>Full leaderboard skeleton</h1>}>
        <Page />
      </ContentLoadingContext.Provider>
    </NavigationContext.Provider>,
  );
  expect(screen.getByText("Full leaderboard skeleton")).toBeTruthy();
  await act(async () =>
    finishPage(
      <main>
        <HomeGridSection>
          <h1>Leaderboard</h1>
          <Rows />
        </HomeGridSection>
      </main>,
    ),
  );
  expect(await screen.findByRole("status", { name: "Loading content" })).toBeTruthy();
  expect(screen.queryByText("Full leaderboard skeleton")).toBeNull();
  expect(view.container.querySelectorAll("main")).toHaveLength(1);
  expect(view.container.querySelectorAll("main .home-grid-section")).toHaveLength(1);
  expect(view.container.querySelector(".home-grid-frame .home-grid-section")).toBeNull();
  await act(async () => finishRows(<p>Builder rows</p>));
  expect(await screen.findByText("Builder rows")).toBeTruthy();
});

it.each(["/builders", "/actors/compare/apify/instagram-scraper"])(
  "keeps the public section frame when the page read fails on %s",
  async (pathname) => {
    const Page = withClientData(async () => {
      throw new Error("Catalog unavailable");
    });
    const view = render(
      <NavigationContext.Provider value={{ pathname, search: "", params: {}, version: 0 }}>
        <Page />
      </NavigationContext.Provider>,
    );
    const alert = await screen.findByRole("alert");
    expect(alert.classList.contains("home-grid-section")).toBe(true);
    expect(alert.querySelector(":scope > .home-grid-frame")).toBeTruthy();
    expect(view.container.querySelectorAll(".home-grid-frame")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  },
);

it("keeps a nested failure inside its existing public grid cell", async () => {
  const Rows = withClientData(async () => {
    throw new Error("Rows unavailable");
  });
  const Page = withClientData(async () => (
    <main>
      <HomeGridSection>
        <h1>Leaderboard</h1>
        <Rows />
      </HomeGridSection>
    </main>
  ));
  const view = render(
    <NavigationContext.Provider
      value={{ pathname: "/builders", search: "", params: {}, version: 0 }}
    >
      <Page />
    </NavigationContext.Provider>,
  );
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Leaderboard" })).toBeTruthy();
  expect(view.container.querySelector(".home-grid-frame .home-grid-section")).toBeNull();
});

it("keeps the page fallback when a route delegates to another data view before rendering a frame", async () => {
  const Detail = withClientData(async () => new Promise<React.ReactNode>(() => {}));
  const Page = withClientData(async () => <Detail />);
  render(
    <NavigationContext.Provider
      value={{ pathname: "/actors/compare", search: "", params: {}, version: 0 }}
    >
      <ContentLoadingContext.Provider value={<h1>Comparison page skeleton</h1>}>
        <Page />
      </ContentLoadingContext.Provider>
    </NavigationContext.Provider>,
  );
  await waitFor(() => expect(screen.getByText("Comparison page skeleton")).toBeTruthy());
  expect(screen.queryByRole("status", { name: "Loading content" })).toBeNull();
});
