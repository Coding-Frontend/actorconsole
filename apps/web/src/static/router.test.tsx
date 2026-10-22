import { useState, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StaticRoutes, type PageModule } from "./router";
import { NavigationContext, useSearchParams } from "./navigation";
import { withClientData } from "./client-data";

afterEach(cleanup);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function Shell({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <nav aria-label="Workspace navigation">
        <button onClick={() => setExpanded(!expanded)}>
          {expanded ? "Collapse section" : "Expand section"}
        </button>
      </nav>
      <main>{children}</main>
    </>
  );
}
const location = {
  pathname: "/dashboard/a",
  search: "",
  params: {},
  version: 0,
  workspaceVersion: 0,
};
const a = "../app/(dashboard)/dashboard/a/page.tsx";
const b = "../app/(dashboard)/dashboard/b/page.tsx";
const shell = "../app/(dashboard)/dashboard/layout.tsx";

it.each(["/dashboard/revenue", "/admin/users"])(
  "keeps filters, focus and page state through overlapping query reads on %s",
  async (pathname) => {
    const first = deferred<ReactNode>();
    const latest = deferred<ReactNode>();
    function Results({ label }: { label: string }) {
      const [open, setOpen] = useState(false);
      const [search, setSearch] = useState("");
      const query = useSearchParams();
      return (
        <>
          <h2>{label}</h2>
          <button onClick={() => setOpen(!open)}>Actor picker</button>
          {open && (
            <input
              aria-label="Find an Actor"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          )}
          <p>Requested: {query.get("actors") ?? "all"}</p>
        </>
      );
    }
    const load = vi.fn(
      async ({ searchParams }: { searchParams?: Promise<Record<string, string>> }) => {
        const query = await searchParams;
        return query?.actors === "first" ? (
          first.promise
        ) : query?.actors === "latest" ? (
          latest.promise
        ) : (
          <Results label="Original results" />
        );
      },
    );
    const Page = withClientData(load);
    const page = `../app${pathname}/page.tsx`;
    const layout = pathname.startsWith("/admin")
      ? "../app/admin/layout.tsx"
      : "../app/dashboard/layout.tsx";
    const pages = { [page]: async () => ({ default: Page }) };
    const layouts = { [layout]: async () => ({ default: Shell as PageModule["default"] }) };
    const route = (search: string, version: number) => (
      <NavigationContext.Provider value={{ ...location, pathname, search, version }}>
        <StaticRoutes pages={pages} layouts={layouts} />
      </NavigationContext.Provider>
    );
    const view = render(route("", 0));
    await screen.findByText("Original results");
    fireEvent.click(screen.getByRole("button", { name: "Actor picker" }));
    const input = screen.getByRole("textbox", { name: "Find an Actor" });
    fireEvent.change(input, { target: { value: "maps" } });
    input.focus();
    const heading = screen.getByRole("heading");
    const navigation = screen.getByRole("navigation");
    view.rerender(route("?actors=first", 1));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("heading")).toBe(heading);
    expect(screen.getByRole("textbox")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(screen.getByText("Updating results…")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading page content" })).toBeNull();
    view.rerender(route("?actors=latest", 2));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
    expect(screen.getByText("Requested: latest")).toBeTruthy();
    await act(async () => latest.resolve(<Results label="Latest results" />));
    await screen.findByText("Latest results");
    expect(screen.getByRole("textbox")).toBe(input);
    expect((input as HTMLInputElement).value).toBe("maps");
    expect(screen.getByRole("navigation")).toBe(navigation);
    expect(screen.queryByText("Updating results…")).toBeNull();
    await act(async () => first.resolve(<Results label="Obsolete results" />));
    expect(screen.queryByText("Obsolete results")).toBeNull();
    expect(screen.getByText("Latest results")).toBeTruthy();
    view.rerender(route("?actors=latest", 3));
    expect(screen.getByRole("textbox")).toBe(input);
    expect(screen.getByText("Updating results…")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Updating results…")).toBeNull());
    expect(screen.getByRole("textbox")).toBe(input);
  },
);

it("preserves the shell and saved selection through a failed import and retry", async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module"))
    .mockResolvedValue({ default: () => <h2>Schedule review</h2> });
  const pages = { [a]: async () => ({ default: () => <h2>Publishing</h2> }), [b]: load };
  const layouts = { [shell]: async () => ({ default: Shell as PageModule["default"] }) };
  const route = (pathname: string, version: number) => (
    <NavigationContext.Provider value={{ ...location, pathname, version }}>
      <StaticRoutes pages={pages} layouts={layouts} />
    </NavigationContext.Provider>
  );
  const view = render(route("/dashboard/a", 0));
  await screen.findByText("Publishing");
  const navigation = screen.getByRole("navigation");
  window.sessionStorage.setItem("selected-actors-test", '["one","two"]');
  view.rerender(route("/dashboard/b", 1));
  await screen.findByText("This page could not finish downloading");
  expect(screen.getByRole("navigation")).toBe(navigation);
  expect(window.sessionStorage.getItem("selected-actors-test")).toBe('["one","two"]');
  view.rerender(route("/dashboard/b", 2));
  await screen.findByText("Schedule review");
  expect(screen.getByRole("navigation")).toBe(navigation);
});

it("a synchronous metadata error does not turn a loaded page into a navigation failure", async () => {
  render(
    <NavigationContext.Provider value={location}>
      <StaticRoutes
        pages={{
          [a]: async () => ({
            default: () => <h2>Loaded content</h2>,
            generateMetadata: () => {
              throw new Error("metadata unavailable");
            },
          }),
        }}
        layouts={{}}
      />
    </NavigationContext.Provider>,
  );
  await screen.findByText("Loaded content");
  await waitFor(() => expect(document.title).toBe("ActorConsole — Apify operations"));
  expect(screen.queryByRole("alert")).toBeNull();
});

it("keeps the shell DOM and expanded state while the next page code loads", async () => {
  const nextPage = deferred<PageModule>();
  const pages = {
    [a]: async () => ({ default: () => <h2>Page A</h2> }),
    [b]: () => nextPage.promise,
  };
  const layouts = { [shell]: async () => ({ default: Shell as PageModule["default"] }) };
  const loadingPages = {
    "../app/(dashboard)/dashboard/b/loading.tsx": async () => ({
      default: () => <p>Page B shimmer</p>,
    }),
  };
  const view = render(
    <NavigationContext.Provider value={location}>
      <StaticRoutes pages={pages} layouts={layouts} loadingPages={loadingPages} />
    </NavigationContext.Provider>,
  );
  await screen.findByText("Page A");
  const originalNavigation = screen.getByRole("navigation");
  fireEvent.click(screen.getByRole("button", { name: "Expand section" }));
  view.rerender(
    <NavigationContext.Provider value={{ ...location, pathname: "/dashboard/b", version: 1 }}>
      <StaticRoutes pages={pages} layouts={layouts} loadingPages={loadingPages} />
    </NavigationContext.Provider>,
  );
  await screen.findByText("Page B shimmer");
  expect(screen.getByRole("navigation")).toBe(originalNavigation);
  expect(screen.getByRole("button", { name: "Collapse section" })).toBeTruthy();
  expect(screen.queryByText("Page A")).toBeNull();
  await act(async () => nextPage.resolve({ default: () => <h2>Page B</h2> }));
  await screen.findByText("Page B");
  expect(screen.getByRole("navigation")).toBe(originalNavigation);
});

it("updates an async layout's content outlet while its fresh auth read is pending", async () => {
  const revalidation = deferred<void>();
  let calls = 0;
  const Layout = withClientData(
    async ({ children }: { children?: ReactNode }) => {
      if (++calls > 1) await revalidation.promise;
      return <Shell>{children}</Shell>;
    },
    { layout: true },
  );
  const pages = {
    [a]: async () => ({ default: () => <h2>Private page A</h2> }),
    [b]: async () => ({ default: () => <h2>Private page B</h2> }),
  };
  const layouts = { [shell]: async () => ({ default: Layout }) };
  const view = render(
    <NavigationContext.Provider value={location}>
      <StaticRoutes pages={pages} layouts={layouts} />
    </NavigationContext.Provider>,
  );
  await screen.findByText("Private page A");
  const originalNavigation = screen.getByRole("navigation");
  view.rerender(
    <NavigationContext.Provider value={{ ...location, pathname: "/dashboard/b", version: 1 }}>
      <StaticRoutes pages={pages} layouts={layouts} />
    </NavigationContext.Provider>,
  );
  await screen.findByText("Private page B");
  expect(calls).toBe(2);
  expect(screen.getByRole("navigation")).toBe(originalNavigation);
  expect(screen.queryByText("Private page A")).toBeNull();
  await act(async () => revalidation.resolve());
  expect(screen.getByRole("navigation")).toBe(originalNavigation);
});

it("hides old workspace content and layout while validating a new workspace", async () => {
  const nextWorkspace = deferred<void>();
  let calls = 0;
  const Layout = withClientData(
    async ({ children }: { children?: ReactNode }) => {
      const call = ++calls;
      if (call > 1) await nextWorkspace.promise;
      return (
        <section>
          <h2>{call === 1 ? "Old workspace" : "New workspace"}</h2>
          {children}
        </section>
      );
    },
    { layout: true },
  );
  const pages = { [a]: async () => ({ default: () => <p>Current portfolio</p> }) };
  const layouts = { [shell]: async () => ({ default: Layout }) };
  const view = render(
    <NavigationContext.Provider value={location}>
      <StaticRoutes pages={pages} layouts={layouts} />
    </NavigationContext.Provider>,
  );
  await screen.findByText("Old workspace");
  view.rerender(
    <NavigationContext.Provider value={{ ...location, version: 1, workspaceVersion: 1 }}>
      <StaticRoutes pages={pages} layouts={layouts} />
    </NavigationContext.Provider>,
  );
  expect(screen.queryByText("Old workspace")).toBeNull();
  expect(screen.queryByText("Current portfolio")).toBeNull();
  await act(async () => nextWorkspace.resolve());
  await screen.findByText("New workspace");
  await waitFor(() => expect(screen.getByText("Current portfolio")).toBeTruthy());
});

it("preserves the public shell across signup, docs and nested docs loading in both directions", async () => {
  const signup = "../app/(auth)/signup/page.tsx";
  const docs = "../app/(marketing)/docs/page.tsx";
  const authLayout = "../app/(auth)/layout.tsx";
  const publicLayout = "../app/(marketing)/layout.tsx";
  const docsLayout = "../app/(marketing)/docs/layout.tsx";
  const nextDocs = deferred<PageModule>();
  const nextDocsLayout = deferred<PageModule>();
  const pages = {
    [signup]: async () => ({ default: () => <h2>Signup form</h2> }),
    [docs]: () => nextDocs.promise,
  };
  const layouts = {
    [publicLayout]: async () => ({ default: Shell as PageModule["default"] }),
    [authLayout]: async () => ({ default: ({ children }: { children?: ReactNode }) => children }),
    [docsLayout]: () => nextDocsLayout.promise,
  };
  const initialModules = { [publicLayout]: { default: Shell as PageModule["default"] } };
  const route = (pathname: string, version: number) => (
    <NavigationContext.Provider value={{ ...location, pathname, version }}>
      <StaticRoutes
        pages={pages}
        layouts={layouts}
        layoutParents={{ [authLayout]: publicLayout }}
        initialModules={initialModules}
      />
    </NavigationContext.Provider>
  );
  const view = render(route("/signup", 0));
  const originalNavigation = screen.getByRole("navigation");
  await screen.findByText("Signup form");
  fireEvent.click(screen.getByRole("button", { name: "Expand section" }));
  view.rerender(route("/docs", 1));
  expect(screen.getByRole("navigation")).toBe(originalNavigation);
  expect(screen.getByRole("status", { name: "Loading page content" })).toBeTruthy();
  await act(async () => {
    nextDocs.resolve({ default: () => <h2>Docs article</h2> });
    nextDocsLayout.resolve({
      default: ({ children }: { children?: ReactNode }) => <section>{children}</section>,
    });
  });
  await screen.findByText("Docs article");
  expect(screen.getByRole("navigation")).toBe(originalNavigation);
  view.rerender(route("/signup", 2));
  await screen.findByText("Signup form");
  expect(screen.getByRole("navigation")).toBe(originalNavigation);
  expect(screen.getByRole("button", { name: "Collapse section" })).toBeTruthy();
});
