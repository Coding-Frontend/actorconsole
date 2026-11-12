import { forwardRef, type AnchorHTMLAttributes } from "react";

export default forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  function LocalLink({ children, ...props }, ref) {
    return <a ref={ref} {...props}>{children}</a>;
  },
);
