import { useEffect, useRef } from "react";
import { usePathname } from "./navigation";
import { API_BASE_URL } from "./api-base";
import { publicApiPath, publicPageRoute } from "../../../../.deploy/pages/public-pages.js";

/** Reuse only the exact anonymous response embedded by the public HTML Worker. */
export function installInitialPublicRead() {
  const element = document.getElementById("ac-public-read");
  if (!element) return;
  let seed: { path: string; apiPath: string; expires: number; payload: unknown };
  try {
    seed = JSON.parse(element.textContent ?? "");
  } catch {
    return;
  }
  element.remove();
  const route = publicPageRoute(window.location.pathname);
  if (
    !route ||
    seed.path !== route.path ||
    seed.apiPath !== publicApiPath(route) ||
    !Number.isFinite(seed.expires) ||
    seed.expires > Date.now() + 61_000
  )
    return;
  const original = window.fetch.bind(window);
  const seededUrl = new URL(seed.apiPath, `${API_BASE_URL}/`).href;
  window.fetch = async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      window.location.origin,
    );
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    if (method === "GET" && url.href === seededUrl && Date.now() < seed.expires) {
      (init?.signal ?? (input instanceof Request ? input.signal : undefined))?.throwIfAborted();
      return Response.json(seed.payload);
    }
    return original(input, init);
  };
}

/** The static router updates title/description; keep initial HTML tags in sync
 * when client navigation moves away, including into private account routes. */
export function PublicHtmlMetadata() {
  const pathname = usePathname();
  const initialPolicy = useRef({
    pathname,
    noindex:
      document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content.includes("noindex") ??
      false,
  });
  useEffect(() => {
    const update = () => {
      const privatePage =
        /^\/(dashboard|admin|login|signup|forgot-password|reset-password|verify-email)(\/|$)/.test(
          pathname,
        );
      const canonical = `${process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin}${pathname}`;
      const description =
        document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? "";
      const set = (name: string, content: string, property = false) => {
        let element = document.head.querySelector<HTMLMetaElement>(
          `meta[${property ? "property" : "name"}="${name}"]`,
        );
        if (!element) {
          element = document.createElement("meta");
          element.setAttribute(property ? "property" : "name", name);
          document.head.append(element);
        }
        element.dataset.acPageMeta = "";
        element.content = content;
      };
      let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.append(link);
      }
      link.dataset.acPageMeta = "";
      link.href = canonical;
      set("og:title", document.title, true);
      set("og:description", description, true);
      set("og:url", canonical, true);
      set("og:type", /^\/(blog|changelog)\//.test(pathname) ? "article" : "website", true);
      set("twitter:title", document.title);
      set("twitter:description", description);
      set("twitter:card", "summary");
      const noindex =
        privatePage ||
        pathname === "/newsletter/unsubscribe" ||
        (initialPolicy.current.pathname === pathname && initialPolicy.current.noindex);
      set("robots", noindex ? "noindex, nofollow" : "index, follow");
    };
    // Route-specific images and publication dates must never carry to another page.
    document.head
      .querySelectorAll('meta[property="og:image"], meta[property="article:published_time"]')
      .forEach((element) => element.remove());
    update();
    const observer = new MutationObserver(update);
    const title = document.head.querySelector("title");
    const description = document.head.querySelector('meta[name="description"]');
    if (title) observer.observe(title, { childList: true, subtree: true, characterData: true });
    if (description)
      observer.observe(description, { attributes: true, attributeFilter: ["content"] });
    return () => observer.disconnect();
  }, [pathname]);
  return null;
}
