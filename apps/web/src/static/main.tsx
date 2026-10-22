import { createRoot } from "react-dom/client";
import { NavigationProvider, navigate } from "./navigation";
import { installApiRequests, isReadOnlyPreview } from "./requests";
import { StaticRoutes, type PageModule } from "./router";
import { PublicLayout, AuthEntryGuard } from "./public-layout";
import { installInternalLinks } from "./internal-links";
import { matchRoute, routeDefinitions } from "./routes";
import { SessionProvider } from "../lib/session-client";
import { ThemeProvider } from "../components/theme-provider";
import { CookieConsent } from "../components/cookie-consent";
import { FirebaseAnalytics } from "../components/firebase-analytics";
import { Toaster } from "sonner";
import { installInitialPublicRead, PublicHtmlMetadata } from "./public-html";
import "../app/globals.css";
import "./styles.css";

const pages = import.meta.glob<PageModule>("../app/**/page.tsx");
pages["../app/page.tsx"] = () => import("./home");
const layouts = import.meta.glob<PageModule>(["../app/**/layout.tsx", "!../app/layout.tsx"]);
const publicLayoutFile = "../app/(marketing)/layout.tsx";
const authLayoutFile = "../app/(auth)/layout.tsx";
const publicModule: PageModule = { default: PublicLayout };
layouts[publicLayoutFile] = async () => publicModule;
layouts[authLayoutFile] = async () => ({ default: AuthEntryGuard });
const loadingPages = import.meta.glob<PageModule>("../app/**/loading.tsx");
const readOnlyPreview = isReadOnlyPreview();
installInitialPublicRead();
installApiRequests({ readOnly: readOnlyPreview });
const clientRoutes = routeDefinitions(Object.entries(pages));
installInternalLinks((pathname) => Boolean(matchRoute(pathname, clientRoutes)));
// Legacy links keep their familiar routes after the static migration.
const legacy: Record<string, string> = {
  "/dashboard/settings": "/dashboard/apify",
  "/dashboard/settings/api-keys": "/dashboard/mcp",
  "/dashboard/api-keys": "/dashboard/mcp",
  "/dashboard/settings/profile": "/dashboard/profile",
  "/dashboard/settings/notifications": "/dashboard/notification-preferences",
  "/dashboard/settings/billing": "/dashboard/billing",
  "/dashboard/settings/export": "/dashboard/data-export",
  "/dashboard/settings/account": "/dashboard/account",
  "/compare": "/features",
  "/vs-actorhunt": "/features",
  "/vs-n8n": "/features",
  "/vs-bright-data": "/features",
  "/vs-zyte": "/features",
};
if (legacy[window.location.pathname]) navigate(legacy[window.location.pathname], true);
createRoot(document.getElementById("root")!).render(
  <NavigationProvider>
    <PublicHtmlMetadata />
    <SessionProvider>
      <ThemeProvider>
        {readOnlyPreview ? (
          <div role="status" className="bg-muted px-4 py-2 text-center text-sm">
            Read-only preview — publishing and account changes are disabled.
          </div>
        ) : null}
        <StaticRoutes
          pages={pages}
          layouts={layouts}
          loadingPages={loadingPages}
          layoutParents={{ [authLayoutFile]: publicLayoutFile }}
          initialModules={{ [publicLayoutFile]: publicModule }}
        />
        <Toaster position="top-center" richColors />
        <CookieConsent />
        <FirebaseAnalytics />
      </ThemeProvider>
    </SessionProvider>
  </NavigationProvider>,
);
