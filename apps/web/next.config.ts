import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
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
