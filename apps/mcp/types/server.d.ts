import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Create the complete ActorConsole MCP server without opening a transport. */
export declare function createServer(): Promise<McpServer>;
