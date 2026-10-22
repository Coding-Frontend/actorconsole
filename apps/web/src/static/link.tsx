import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { navigate } from "./navigation";
import { normalizeApiUrl } from "./requests";
type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string; query?: Record<string, string | number>; hash?: string };
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean;
  legacyBehavior?: boolean;
  passHref?: boolean;
};
export default forwardRef<HTMLAnchorElement, Props>(function Link(
  {
    href,
    children,
    replace,
    scroll,
    prefetch: _prefetch,
    legacyBehavior: _legacyBehavior,
    passHref: _passHref,
    onClick,
    ...props
  },
  ref,
) {
  const target = normalizeApiUrl(
    typeof href === "string"
      ? href
      : `${href.pathname ?? ""}${href.query ? `?${new URLSearchParams(Object.entries(href.query).map(([key, value]) => [key, String(value)]))}` : ""}${href.hash ?? ""}`,
  );
  const clicked = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (props.target && props.target !== "_self") ||
      props.download !== undefined
    )
      return;
    const url = new URL(target, window.location.href);
    const samePageFragment =
      url.hash &&
      url.pathname === window.location.pathname &&
      url.search === window.location.search;
    if (
      url.origin === window.location.origin &&
      !samePageFragment &&
      !url.pathname.startsWith("/api/")
    ) {
      event.preventDefault();
      navigate(target, replace, scroll !== false);
    }
  };
  return (
    <a {...props} href={target} ref={ref} onClick={clicked}>
      {children}
    </a>
  );
});
