import { navigate } from "./navigation";
import { APP_NAVIGATION_EVENT } from "../lib/client-navigation";

/** Cover ordinary anchors produced by Markdown/HTML as well as React Link. */
export function installInternalLinks(isRoute: (pathname: string) => boolean) {
  const redirected = (event: Event) => {
    const { href, replace } = (event as CustomEvent<{ href: string; replace: boolean }>).detail;
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || !isRoute(url.pathname)) return;
    event.preventDefault();
    navigate(url.href, replace);
  };
  const clicked = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const anchor =
      event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self"))
      return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || !isRoute(url.pathname)) return;
    if (
      url.hash &&
      url.pathname === window.location.pathname &&
      url.search === window.location.search
    )
      return;
    event.preventDefault();
    navigate(url.href);
  };
  const submitted = (event: SubmitEvent) => {
    if (event.defaultPrevented || !(event.target instanceof HTMLFormElement)) return;
    const form = event.target;
    const submitter = event.submitter;
    const method = submitter?.getAttribute("formmethod") ?? form.method;
    const target = submitter?.getAttribute("formtarget") ?? form.target;
    if (method.toLowerCase() !== "get" || (target && target !== "_self")) return;
    const url = new URL(submitter?.getAttribute("formaction") ?? form.action, window.location.href);
    if (url.origin !== window.location.origin || !isRoute(url.pathname)) return;
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(form, submitter))
      params.append(name, typeof value === "string" ? value : value.name);
    url.search = params.toString();
    event.preventDefault();
    navigate(url.href);
  };
  document.addEventListener("click", clicked);
  document.addEventListener("submit", submitted);
  window.addEventListener(APP_NAVIGATION_EVENT, redirected);
  return () => {
    document.removeEventListener("click", clicked);
    document.removeEventListener("submit", submitted);
    window.removeEventListener(APP_NAVIGATION_EVENT, redirected);
  };
}
