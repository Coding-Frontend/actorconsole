/**
 * Format a tool result as an MCP-compliant response.
 */
export function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

export function jsonResult(data: unknown) {
  return textResult(JSON.stringify(data, null, 2));
}

export function errorResult(message: string, details?: unknown) {
  const detailMessage =
    details instanceof Error ? details.message : typeof details === "string" ? details : null;
  const safeDetails =
    process.env.NODE_ENV === "development" && detailMessage
      ? detailMessage
          .replace(/(bearer|token|password|secret|api[_-]?key)[=: ]+[^\s,;]+/gi, "$1=[redacted]")
          .replace(/[A-Za-z]:\\[^\n]+|\/(?:home|Users|opt|app)\/[^\n]+/g, "[path redacted]")
          .slice(0, 500)
      : null;
  const full = safeDetails ? `${message}\n\n${safeDetails}` : message;
  return {
    isError: true,
    content: [{ type: "text" as const, text: full }],
  };
}
