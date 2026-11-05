import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const canonicalSite = new URL(
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://actorconsole.com",
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Keep metadata in the initial HTML head for every social preview crawler,
  // including platforms whose user agents Next.js does not recognize yet.
  htmlLimitedBots: /.*/,
  experimental: {
    // Helps pnpm monorepos find workspace packages
    externalDir: true,
  },
  transpilePackages: ["@actorconsole/shared"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "apify.com" },
      { protocol: "https", hostname: "api.apify.com" },
      { protocol: "https", hostname: "images.apify.com" },
      { protocol: "https", hostname: "**.apifyusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "lh4.googleusercontent.com" },
      { protocol: "https", hostname: "lh5.googleusercontent.com" },
      { protocol: "https", hostname: "*.firebaseapp.com" },
    ],
  },
  async redirects() {
    return [
      ...(!canonicalSite.hostname.startsWith("www.") && canonicalSite.protocol === "https:"
        ? [
            {
              source: "/:path*",
              has: [
                {
                  type: "host" as const,
                  value: `www\\.${canonicalSite.hostname.replace(/\./g, "\\.")}`,
                },
              ],
              destination: `${canonicalSite.origin}/:path*`,
              permanent: true,
            },
          ]
        : []),
      {
        source: "/docs/getting-started",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/compare",
        destination: "/features",
        permanent: true,
      },
      {
        source: "/vs-actorhunt",
        destination: "/features",
        permanent: true,
      },
      {
        source: "/vs-n8n",
        destination: "/features",
        permanent: true,
      },
      {
        source: "/vs-bright-data",
        destination: "/features",
        permanent: true,
      },
      {
        source: "/vs-zyte",
        destination: "/features",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

// Only enable the Sentry build plugin when SENTRY_AUTH_TOKEN is set;
// this keeps the build fast in dev/CI and avoids uploading source
// maps we don't have a token for.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

export default sentryAuthToken
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT ?? "actorconsole-web",
      authToken: sentryAuthToken,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      webpack: { treeshake: { removeDebugLogging: true } },
    })
  : nextConfig;
