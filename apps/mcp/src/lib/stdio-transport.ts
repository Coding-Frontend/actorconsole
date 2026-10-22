import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isJSONRPCRequest } from "@modelcontextprotocol/sdk/types.js";
import { ActorConsoleApiError, verifyActorConsoleMcpAccess } from "./actorconsole-api.js";
import { createStdioRequestContext, runWithMcpRequestContext } from "./request-context.js";

/** Give stdio the same per-request authentication and audit context as HTTP. */
export class WorkspaceStdioTransport extends StdioServerTransport {
  override async start(): Promise<void> {
    const dispatch = this.onmessage;
    this.onmessage = (message) => {
      if (!isJSONRPCRequest(message)) {
        dispatch?.(message);
        return;
      }
      void runWithMcpRequestContext(createStdioRequestContext(message), async () => {
        try {
          await verifyActorConsoleMcpAccess();
          dispatch?.(message);
        } catch (error) {
          await this.send({
            jsonrpc: "2.0",
            id: message.id,
            error: {
              code: -32001,
              message:
                error instanceof ActorConsoleApiError
                  ? error.message
                  : "Unable to verify ActorConsole access. Check your credential and API_BASE_URL.",
              ...(error instanceof ActorConsoleApiError ? { data: { status: error.status } } : {}),
            },
          });
        }
      }).catch((error) =>
        this.onerror?.(error instanceof Error ? error : new Error(String(error))),
      );
    };
    await super.start();
  }
}
