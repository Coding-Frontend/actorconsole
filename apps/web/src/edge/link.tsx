import { forwardRef, type AnchorHTMLAttributes } from "react";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
};
export default forwardRef<HTMLAnchorElement, Props>(function Link(
  { href, children, prefetch: _prefetch, replace: _replace, scroll: _scroll, ...props },
  ref,
) {
  return (
    <a {...props} href={href} ref={ref}>
      {children}
    </a>
  );
});
