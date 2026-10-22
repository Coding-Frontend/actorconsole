export const APP_NAVIGATION_EVENT = "actorconsole:navigate";

/** The static router handles registered routes; other destinations use the browser. */
export function navigateInApp(href: string, replace = false) {
  const event = new CustomEvent(APP_NAVIGATION_EVENT, {
    cancelable: true,
    detail: { href, replace },
  });
  if (window.dispatchEvent(event)) {
    if (replace) window.location.replace(href);
    else window.location.assign(href);
  }
}
