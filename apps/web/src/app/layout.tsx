import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { SessionProvider } from "@/lib/session-client";
import { ThemeProvider } from "@/components/theme-provider";
import { CookieConsent } from "@/components/cookie-consent";
import { FirebaseAnalytics } from "@/components/firebase-analytics";
import "./globals.css";

const sans = localFont({
  src: "../fonts/ibm-plex-sans-latin-variable.woff2",
  weight: "400 700",
  variable: "--font-sans",
  display: "swap",
});

const display = localFont({
  src: "../fonts/bricolage-grotesque-latin-variable.woff2",
  weight: "400 700",
  variable: "--font-display",
  display: "swap",
});

const mono = localFont({
  src: [
    { path: "../fonts/ibm-plex-mono-latin-400.woff2", weight: "400" },
    { path: "../fonts/ibm-plex-mono-latin-500.woff2", weight: "500" },
    { path: "../fonts/ibm-plex-mono-latin-600.woff2", weight: "600" },
  ],
  variable: "--font-mono",
  display: "swap",
});

const themeScript = `(() => {
  try {
    const stored = localStorage.getItem("ac-theme");
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const theme = stored === "dark" || stored === "light" ? stored : preferred;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  } catch {}
})();`;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:8080"),
  title: {
    default: "ActorConsole — The DevOps platform for Apify Actor builders",
    template: "%s · ActorConsole",
  },
  description:
    "Store optimization, scheduled actor tasks, publishing, and usage-cost reporting for Apify developers.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
      { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "ActorConsole",
    description: "Manage, optimize, schedule, and review Apify actors.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
    >
      <head>
        <script id="actorconsole-theme" dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="blueprint-page bg-background text-foreground min-h-screen font-sans antialiased">
        <SessionProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </SessionProvider>
        <Toaster position="top-center" richColors />
        <FirebaseAnalytics />
        <CookieConsent />
      </body>
    </html>
  );
}
