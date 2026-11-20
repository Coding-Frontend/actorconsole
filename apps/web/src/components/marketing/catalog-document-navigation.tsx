"use client";

import { useEffect } from "react";
import { navigateInApp } from "@/lib/client-navigation";

/** Public catalog HTML and Pages have separate builds and static asset origins. */
export function CatalogDocumentNavigation() {
  useEffect(() => {
    const navigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
        event.shiftKey || event.altKey || !(event.target instanceof Element)
      ) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (
        !anchor || anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      ) return;
      const url = new URL(anchor.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        (url.pathname === window.location.pathname && url.search === window.location.search)
      ) return;
      event.preventDefault();
      navigateInApp(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", navigate, true);
    return () => document.removeEventListener("click", navigate, true);
  }, []);
  return null;
}
