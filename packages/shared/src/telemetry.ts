import { getLogger } from "./logger.js";

type OpenTelemetrySdk = {
  start(): void;
  shutdown(): Promise<void>;
};

let sdk: OpenTelemetrySdk | null = null;
let shutdownHooksRegistered = false;

function traceEndpoint(): string | null {
  if (process.env.OTEL_SDK_DISABLED === "true") return null;
  const explicit = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();
  if (explicit) return explicit;
  const base = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/v1/traces`;
}

function exporterHeaders(): Record<string, string> {
  const value = process.env.OTEL_EXPORTER_OTLP_HEADERS ?? "";
  return Object.fromEntries(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.includes("="))
      .map((entry) => {
        const separator = entry.indexOf("=");
        return [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()];
      }),
  );
}

/**
 * Start optional Node.js tracing for API, worker, or MCP processes.
 *
 * The SDK is enabled only when an OTLP endpoint is configured, so local
 * development and tests do not create exporters or network connections.
 * Auto-instrumentation covers HTTP, Redis, MySQL, and BullMQ dependencies.
 */
export async function initOpenTelemetry(
  serviceName: string,
  log = getLogger("shared:otel"),
): Promise<void> {
  if (sdk) return;
  const endpoint = traceEndpoint();
  if (!endpoint) return;

  try {
    const [{ NodeSDK }, { getNodeAutoInstrumentations }, { OTLPTraceExporter }] = await Promise.all(
      [
        import("@opentelemetry/sdk-node"),
        import("@opentelemetry/auto-instrumentations-node"),
        import("@opentelemetry/exporter-trace-otlp-http"),
      ],
    );

    const instance = new NodeSDK({
      serviceName,
      traceExporter: new OTLPTraceExporter({ url: endpoint, headers: exporterHeaders() }),
      instrumentations: [getNodeAutoInstrumentations()],
    });
    instance.start();
    sdk = instance;

    if (!shutdownHooksRegistered) {
      shutdownHooksRegistered = true;
      const shutdown = () => {
        void sdk?.shutdown().catch((error) => log.warn({ error }, "OpenTelemetry shutdown failed"));
      };
      process.once("SIGTERM", shutdown);
      process.once("SIGINT", shutdown);
    }
    log.info(
      { serviceName, endpoint: endpoint.replace(/\/v1\/traces$/, "") },
      "OpenTelemetry tracing enabled",
    );
  } catch (error) {
    log.warn({ error, serviceName }, "OpenTelemetry tracing could not be enabled");
  }
}
