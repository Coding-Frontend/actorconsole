/// <reference types="node" />
declare namespace NodeJS {
  interface ProcessEnv {
    API_BASE_URL?: string;
    MCP_TRANSPORT?: "stdio" | "http";
    MCP_PORT?: string;
    MCP_HOST?: string;
    ACTORCONSOLE_API_KEY?: string;
  }
}
