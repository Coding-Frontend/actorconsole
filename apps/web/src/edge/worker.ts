import { proxyExtensionDevice } from "../../../../.deploy/pages/extension-device-proxy.js";
import { servePublicPage } from "../../../../.deploy/pages/public-pages.js";
import { decodeApiData } from "@actorconsole/shared/api-data";
import { renderPublicPage } from "./render";
import template from "../../dist-pages/index.html?raw";

declare const __PUBLIC_BUILD_ID__: string;
type Context = { waitUntil(promise: Promise<unknown>): void };
type Assets = { fetch(request: Request): Promise<Response> };
export default {
  fetch(request: Request, env: { ASSETS: Assets }, context: Context) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/extension-device/")) return proxyExtensionDevice(request);
    if (
      (path.startsWith("/builders/") && !/^\/builders\/compare(?:\/|$)/.test(path)) ||
      path.startsWith("/blog/") ||
      (path.startsWith("/changelog/") && path !== "/changelog/feed")
    )
      return servePublicPage(request, {
        template,
        buildId: __PUBLIC_BUILD_ID__,
        render: renderPublicPage,
        decode: decodeApiData,
        cache: (caches as CacheStorage & { default: Cache }).default,
        context,
        reportError(error: Error) {
          // Server-only diagnostics contain no caller credentials or response data.
          // eslint-disable-next-line no-console
          console.error("Public HTML unavailable", error.message);
        },
      });
    return env.ASSETS.fetch(request);
  },
};
