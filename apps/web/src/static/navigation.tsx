import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type NavigationLocation = {
  pathname: string;
  search: string;
  version: number;
  params: Record<string, string | string[]>;
  workspaceVersion?: number;
  hash?: string;
};
export const NavigationContext = createContext<NavigationLocation>({
  pathname: "/",
  search: "",
  version: 0,
  params: {} as Record<string, string | string[]>,
});
export function navigate(href: string, replace = false, scroll = true) {
  const url = new URL(href, window.location.href);
  const pathnameChanged = url.pathname !== window.location.pathname;
  if (url.origin !== window.location.origin) {
    window.location.assign(url.href);
    return;
  }
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
  // Filters and pagination retain the current viewport; new pages start at the top.
  if (scroll && pathnameChanged && !url.hash)
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}
export function refresh() {
  window.dispatchEvent(new PopStateEvent("popstate"));
}
export function NavigationProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    version: 0,
    workspaceVersion: 0,
    params: {},
  }));
  useEffect(() => {
    const changed = () =>
      setLocation((value) =>
        value.pathname === window.location.pathname &&
        value.search === window.location.search &&
        value.hash !== window.location.hash
          ? { ...value, hash: window.location.hash }
          : {
              pathname: window.location.pathname,
              search: window.location.search,
              hash: window.location.hash,
              version: value.version + 1,
              workspaceVersion: value.workspaceVersion,
              params: {},
            },
      );
    window.addEventListener("popstate", changed);
    const workspaceChanged = () =>
      setLocation((value) => ({
        ...value,
        version: value.version + 1,
        workspaceVersion: value.workspaceVersion + 1,
      }));
    window.addEventListener("actorconsole:workspace-changed", workspaceChanged);
    return () => {
      window.removeEventListener("popstate", changed);
      window.removeEventListener("actorconsole:workspace-changed", workspaceChanged);
    };
  }, []);
  useEffect(() => scrollToFragment(location.hash), [location.version, location.hash]);
  return <NavigationContext.Provider value={location}>{children}</NavigationContext.Provider>;
}

/** Cross-page fragment targets can arrive after the route's code/data does. */
export function scrollToFragment(hash: string) {
  if (!hash) return;
  let id: string;
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    return;
  }
  const scroll = () => {
    const target = document.getElementById(id);
    if (!target) return false;
    target.scrollIntoView();
    return true;
  };
  if (scroll()) return;
  const observer = new MutationObserver(() => {
    if (scroll()) {
      observer.disconnect();
      window.clearTimeout(timeout);
    }
  });
  observer.observe(document.getElementById("root") ?? document.body, {
    childList: true,
    subtree: true,
  });
  const timeout = window.setTimeout(() => observer.disconnect(), 30_000);
  return () => {
    observer.disconnect();
    window.clearTimeout(timeout);
  };
}
export function usePathname() {
  return useContext(NavigationContext).pathname;
}
export function useSearchParams() {
  const { search } = useContext(NavigationContext);
  return useMemo(() => new URLSearchParams(search), [search]);
}
export function useParams<T = Record<string, string | string[]>>() {
  return useContext(NavigationContext).params as T;
}
export function useRouter() {
  return useMemo(
    () => ({
      push: (url: string, options?: { scroll?: boolean }) =>
        navigate(url, false, options?.scroll !== false),
      replace: (url: string, options?: { scroll?: boolean }) =>
        navigate(url, true, options?.scroll !== false),
      refresh,
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      prefetch: () => undefined,
    }),
    [],
  );
}
export class RouteResult extends Error {
  constructor(public target: string | null) {
    super(target ? "Redirect" : "Not found");
  }
}
export function redirect(target: string): never {
  throw new RouteResult(target);
}
export const permanentRedirect = redirect;
export function notFound(): never {
  throw new RouteResult(null);
}
