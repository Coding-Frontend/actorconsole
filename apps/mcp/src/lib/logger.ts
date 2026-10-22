import pino from "pino";

/** stdout belongs exclusively to the stdio MCP protocol, in every environment. */
export function getLogger(service: string) {
  return pino(
    {
      name: service,
      level: process.env.LOG_LEVEL ?? "info",
      redact: {
        paths: ["authorization", "apiKey", "token", "secret", "password", "headers.authorization"],
        censor: "[REDACTED]",
      },
    },
    pino.destination(2),
  );
}
