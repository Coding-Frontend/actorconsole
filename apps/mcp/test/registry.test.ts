import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  MCP_PROMPT_CAPABILITIES,
  MCP_PROMPT_NAMES,
  MCP_RESOURCE_CAPABILITIES,
  MCP_RESOURCE_URIS,
  MCP_TOOL_CAPABILITIES,
  MCP_TOOL_GROUPS,
  MCP_TOOL_INPUTS,
  MCP_TOOL_NAMES,
  MCP_TOOL_SUMMARIES,
} from "@actorconsole/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../src/server.js";

describe("MCP registry", () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
    vi.unstubAllGlobals();
    delete process.env.ACTORCONSOLE_API_KEY;
    delete process.env.API_BASE_URL;
  });

  it("keeps capability discovery synchronized with registered tools and prompts", async () => {
    process.env.ACTORCONSOLE_API_KEY = `al_${"a".repeat(64)}`;
    process.env.API_BASE_URL = "https://api.actorconsole.test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const path = new URL(String(input)).pathname;
        return new Response(
          JSON.stringify({
            ok: true,
            data: path === "/actors" ? [] : {},
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = await createServer();
    const client = new Client({ name: "actorconsole-test", version: "1.0.0" });
    closers.push(
      () => client.close(),
      () => server.close(),
    );
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const tools = await client.listTools();
    const prompts = await client.listPrompts();
    const resources = await client.listResources();
    const resourceTemplates = await client.listResourceTemplates();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([...MCP_TOOL_NAMES].sort());
    expect(MCP_TOOL_GROUPS.flatMap((group) => [...group.tools]).sort()).toEqual(
      [...MCP_TOOL_NAMES].sort(),
    );
    expect(Object.keys(MCP_TOOL_SUMMARIES).sort()).toEqual([...MCP_TOOL_NAMES].sort());
    expect(Object.keys(MCP_TOOL_INPUTS).sort()).toEqual([...MCP_TOOL_NAMES].sort());
    expect(prompts.prompts.map((prompt) => prompt.name).sort()).toEqual(
      [...MCP_PROMPT_NAMES].sort(),
    );
    expect(
      [
        ...resources.resources.map((resource) => resource.uri),
        ...resourceTemplates.resourceTemplates.map((resource) => resource.uriTemplate),
      ].sort(),
    ).toEqual([...MCP_RESOURCE_URIS].sort());
    expect(
      MCP_TOOL_NAMES.filter((name) => name !== "get_mcp_capabilities").every(
        (name) => MCP_TOOL_CAPABILITIES[name],
      ),
    ).toBe(true);
    expect(Object.keys(MCP_RESOURCE_CAPABILITIES).sort()).toEqual([...MCP_RESOURCE_URIS].sort());
    expect(Object.keys(MCP_PROMPT_CAPABILITIES).sort()).toEqual([...MCP_PROMPT_NAMES].sort());
  });
});
