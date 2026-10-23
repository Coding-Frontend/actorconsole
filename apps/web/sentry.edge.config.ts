// Sentry edge runtime config for the Next.js app.
import * as Sentry from "@sentry/nextjs";
import { sentryDataCollection } from "./src/lib/sentry-privacy";

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE
      ? Number(process.env.SENTRY_TRACES_SAMPLE_RATE)
      : 0.1,
    serverName: "actorconsole-web-edge",
    dataCollection: sentryDataCollection,
  });
}
