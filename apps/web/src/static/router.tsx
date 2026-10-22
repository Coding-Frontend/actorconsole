import {
  Component,
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { NavigationContext } from "./navigation";
import { ContentLoading, ContentLoadingContext, ContentState } from "./content-loading";
import { matchRoute, routeDefinitions } from "./routes";
import Link from "./link";
import type { Metadata } from "next";

export type PageModule = {
  default: ComponentType<Record<string, unknown>>;
  metadata?: Pick<Metadata, "title" | "description">;
  generateMetadata?: (props: unknown) => Promise<{ title?: string; description?: string }>;
};
type ModuleLoader = () => Promise<PageModule>;
type Registry = Record<string, ModuleLoader>;
const LayoutChildren = createContext<ReactNode>(null);
function LayoutOutlet() {
  return useContext(LayoutChildren);
}
const outlet = <LayoutOutlet />;

/** Async layouts capture this stable outlet rather than an obsolete page element. */
function LayoutBridge({
  module,
  props,
  children,
}: {
  module: PageModule;
  props: Record<string, unknown>;
  children: ReactNode;
}) {
  return (
    <LayoutChildren.Provider value={children}>
      {createElement(module.default, { ...props, children: outlet })}
    </LayoutChildren.Provider>
  );
}

class RenderBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { failed: boolean; resetKey: string }
> {
  state = { failed: false, resetKey: this.props.resetKey };
  static getDerivedStateFromProps(props: { resetKey: string }, state: { resetKey: string }) {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <ContentState role="alert">
        <h1 className="text-2xl font-semibold">Unable to display this page</h1>
        <button onClick={() => window.location.reload()}>Reload</button>
      </ContentState>
    ) : (
      this.props.children
    );
  }
}

function ancestors(file: string) {
  const directories: string[] = [];
  const parts = file.split("/").slice(0, -1);
  while (parts.length > 1) {
    directories.push(parts.join("/"));
    parts.pop();
  }
  return directories;
}

export function StaticRoutes({
  pages,
  layouts,
  loadingPages = {},
  layoutParents = {},
  initialModules = {},
}: {
  pages: Registry;
  layouts: Registry;
  loadingPages?: Registry;
  layoutParents?: Record<string, string>;
  initialModules?: Record<string, PageModule>;
}) {
  const location = useContext(NavigationContext);
  const key = `${location.pathname}${location.search}:${location.version}`;
  const routes = routeDefinitions(Object.entries(pages));
  const result = matchRoute(location.pathname, routes);
  const pageFile =
    result?.route.file ??
    (location.pathname.startsWith("/admin")
      ? "../app/admin/not-found/page.tsx"
      : location.pathname.startsWith("/dashboard")
        ? "../app/(dashboard)/dashboard/not-found/page.tsx"
        : "../app/(marketing)/not-found/page.tsx");
  const directories = ancestors(pageFile);
  const layoutFiles = directories
    .map((directory) => `${directory}/layout.tsx`)
    .filter((file) => layouts[file])
    .reverse();
  if (pageFile === "../app/page.tsx" && layouts["../app/(marketing)/layout.tsx"])
    layoutFiles.push("../app/(marketing)/layout.tsx");
  for (const file of [...layoutFiles]) {
    const parent = layoutParents[file];
    if (parent && layouts[parent] && !layoutFiles.includes(parent)) layoutFiles.unshift(parent);
  }
  // Root loading.tsx includes a replacement header; only use content skeletons inside a shell.
  const loadingFile = directories
    .map((directory) => `${directory}/loading.tsx`)
    .find((file) => file !== "../app/loading.tsx" && loadingPages[file]);
  const [modules, setModules] = useState<Map<string, PageModule>>(
    () => new Map(Object.entries(initialModules)),
  );
  const pending = useRef(new Map<string, Promise<PageModule>>());
  const [failure, setFailure] = useState<{ key: string; error: unknown }>();
  const query: Record<string, string | string[]> = {};
  for (const name of new URLSearchParams(location.search).keys()) {
    const values = new URLSearchParams(location.search).getAll(name);
    query[name] = values.length > 1 ? values : values[0];
  }
  const props = {
    params: Promise.resolve(result?.params ?? {}),
    searchParams: Promise.resolve(query),
  };

  useEffect(() => {
    let current = true;
    const loadModule = (file: string, load: ModuleLoader): Promise<PageModule> => {
      if (modules.has(file)) return Promise.resolve(modules.get(file)!);
      let request = pending.current.get(file);
      if (!request) {
        request = load()
          .then((module) => {
            setModules((value) => new Map(value).set(file, module));
            return module;
          })
          .finally(() => pending.current.delete(file));
        pending.current.set(file, request);
      }
      return request;
    };
    const imports = layoutFiles.map((file) => loadModule(file, layouts[file]));
    if (result) imports.push(loadModule(pageFile, result.route.load));
    if (loadingFile) void loadModule(loadingFile, loadingPages[loadingFile]).catch(() => undefined);
    Promise.all(imports)
      .then(async () => {
        if (!current || !result) return;
        const page = await loadModule(pageFile, result.route.load);
        const metadata =
          page.metadata ??
          (await Promise.resolve()
            .then(() => page.generateMetadata?.(props))
            .catch(() => undefined));
        if (!current) return;
        const title =
          typeof metadata?.title === "string"
            ? metadata.title
            : metadata?.title && "default" in metadata.title
              ? metadata.title.default
              : metadata?.title && "absolute" in metadata.title
                ? metadata.title.absolute
                : undefined;
        document.title = title
          ? `${title}${title.includes("ActorConsole") ? "" : " · ActorConsole"}`
          : "ActorConsole — Apify operations";
        const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
        if (description)
          description.content =
            metadata?.description ?? "Research, improve, publish and manage your Apify Actors.";
      })
      .catch((error) => {
        if (current) setFailure({ key, error });
      });
    return () => {
      current = false;
    };
    // Module registries are fixed; imports are cached across navigation, while metadata follows the current URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const readyLayouts: string[] = [];
  for (const file of layoutFiles) {
    if (!modules.has(file)) break;
    readyLayouts.push(file);
  }
  const skeleton =
    loadingFile && modules.has(loadingFile) ? (
      createElement(modules.get(loadingFile)!.default)
    ) : (
      <ContentLoading />
    );
  let content: ReactNode =
    failure?.key === key ? (
      <ContentState role="alert">
        <h1 className="text-2xl font-semibold">This page could not finish downloading</h1>
        <p className="mt-2">
          Your session and saved selection are preserved. Try again, or refresh to get the current
          release.
        </p>
        <button
          className="mr-4 mt-4 underline"
          onClick={() => window.dispatchEvent(new PopStateEvent("popstate"))}
        >
          Try again
        </button>
        <button className="mt-4 underline" onClick={() => window.location.reload()}>
          Refresh page
        </button>
      </ContentState>
    ) : !result ? (
      <ContentState>
        <h1>Page not found</h1>
        <Link href="/">Return home</Link>
      </ContentState>
    ) : readyLayouts.length === layoutFiles.length && modules.has(pageFile) ? (
      createElement(modules.get(pageFile)!.default, props)
    ) : (
      skeleton
    );
  content = (
    <ContentLoadingContext.Provider value={skeleton}>
      <RenderBoundary key={`${location.pathname}:${location.workspaceVersion ?? 0}`} resetKey={key}>
        {content}
      </RenderBoundary>
    </ContentLoadingContext.Provider>
  );
  for (const file of readyLayouts.reverse())
    content = (
      <LayoutBridge key={file} module={modules.get(file)!} props={props}>
        {content}
      </LayoutBridge>
    );
  return (
    <NavigationContext.Provider value={{ ...location, params: result?.params ?? {} }}>
      {content}
    </NavigationContext.Provider>
  );
}
