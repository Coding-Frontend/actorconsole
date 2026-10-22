import { useContext, useEffect, useState, type ReactNode } from "react";
import { NavigationContext, navigate, RouteResult } from "./navigation";
import Link from "./link";
import { ContentLoading, ContentLoadingContext, ContentState } from "./content-loading";
import { PageDataPendingContext } from "../lib/page-data-state";
import { GridContentContext } from "../components/marketing/grid-content-boundary";

/** Resolve read-only page data in the browser; discard results from older routes/workspaces. */
export function withClientData<P extends object>(
  load: (props: P) => Promise<ReactNode>,
  options: { layout?: boolean } = {},
) {
  function ClientDataView(props: P) {
    const location = useContext(NavigationContext);
    const inline = useContext(GridContentContext);
    const StateHeading = inline ? "h2" : "h1";
    const pageLoading = useContext(ContentLoadingContext);
    const loading = inline ? <ContentLoading inline /> : pageLoading;
    const workspace = location.workspaceVersion ?? 0;
    const [state, setState] = useState<{
      key: string;
      workspace: number;
      pathname: string;
      content?: ReactNode;
      error?: unknown;
    }>();
    const key = `${location.pathname}${location.search}:${location.version}`;
    useEffect(() => {
      let current = true;
      Promise.resolve()
        .then(() => load(props))
        .then(
          (content) => {
            if (current) setState({ key, workspace, pathname: location.pathname, content });
          },
          (error) => {
            if (!current) return;
            if (error instanceof RouteResult && error.target) {
              const target = new URL(error.target, window.location.origin);
              const callback = target.searchParams.get("callbackUrl");
              const privateRoot = location.pathname.match(/^\/(dashboard|admin)(\/|$)/)?.[1];
              if (
                target.origin === window.location.origin &&
                target.pathname === "/login" &&
                ((!callback && !/^\/(login|signup)(\/|$)/.test(location.pathname)) ||
                  (privateRoot && callback === `/${privateRoot}`))
              ) {
                target.searchParams.set("callbackUrl", `${location.pathname}${location.search}`);
              }
              navigate(target.href, true);
            } else setState({ key, workspace, pathname: location.pathname, error });
          },
        );
      return () => {
        current = false;
      };
      // Route props are rebuilt only for navigation; children remain owned by their layout.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    const pending = state?.key !== key;
    const retainContent = Boolean(
      state?.workspace === workspace &&
      (options.layout || state.pathname === location.pathname) &&
      state.content !== undefined,
    );
    // Query changes and refreshes keep controls mounted; route and workspace
    // changes hide the previous page until its own data has been authorized.
    let content: ReactNode = pending ? (retainContent ? state?.content : loading) : state?.content;
    if (!pending) content = resolvedContent();
    return (
      <PageDataPendingContext.Provider value={pending && retainContent}>
        {content}
        {!options.layout && pending && retainContent ? (
          <p
            role="status"
            className="border-border bg-card fixed bottom-4 right-4 z-40 rounded-sm border px-3 py-2 text-xs shadow-md"
          >
            Updating results…
          </p>
        ) : null}
      </PageDataPendingContext.Provider>
    );

    function resolvedContent() {
      if (!state) return loading;
      if (state.error instanceof RouteResult)
        return (
          <ContentState inline={inline}>
            <StateHeading className="text-2xl font-semibold">Page not found</StateHeading>
            <Link href="/">Return home</Link>
          </ContentState>
        );
      if (state.error)
        return (
          <ContentState role="alert" inline={inline}>
            <StateHeading className="text-2xl font-semibold">Unable to load this page</StateHeading>
            <p>Please try again.</p>
            <button onClick={() => window.dispatchEvent(new PopStateEvent("popstate"))}>
              Retry
            </button>
          </ContentState>
        );
      return state.content;
    }
  }
  ClientDataView.displayName = `ClientData(${load.name})`;
  return ClientDataView;
}
