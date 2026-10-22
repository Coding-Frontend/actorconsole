import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { openApiRoutes, openApiSpec } from "../../src/routes/openapi.js";

function buildApp() {
  const app = new Hono();
  app.route("/", openApiRoutes);
  return app;
}

describe("GET /openapi.json", () => {
  it("returns the OpenAPI 3.1 spec as JSON", async () => {
    const app = buildApp();
    const res = await app.request("/openapi.json");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe("3.1.0");
    expect(body.info.title).toBe("ActorConsole API");
    expect(body.info.version).toBeDefined();
  });

  it("exposes the Health tag with /health and /health/ready paths", async () => {
    const spec = openApiSpec as any;
    expect(spec.paths["/health"]).toBeDefined();
    expect(spec.paths["/health"].get).toBeDefined();
    expect(spec.paths["/health/ready"]).toBeDefined();
    expect(spec.paths["/health/ready"].get.tags).toContain("Health");
  });

  it("documents Actors, Keywords, Publishing, and MCP endpoints", async () => {
    const spec = openApiSpec as any;
    expect(spec.paths["/actors"]).toBeDefined();
    expect(spec.paths["/actors/{apifyActorId}"]).toBeDefined();
    expect(spec.paths["/actors/{apifyActorId}/rewrite-readme"]).toBeUndefined();
    expect(spec.paths["/actors/{apifyActorId}/deploy"]).toBeUndefined();
    expect(spec.paths["/actors/optimization/runs"]).toBeDefined();
    expect(spec.paths["/actors/optimization/runs/{runId}/approve"]).toBeDefined();
    expect(spec.paths["/keywords/search"]).toBeDefined();
    expect(spec.paths["/keywords/watchlist"]).toBeDefined();
    expect(spec.paths["/schedules"]).toBeUndefined();
    expect(spec.paths["/bulk-publishing/schedules"]).toBeDefined();
    expect(spec.paths["/mcp/info"]).toBeDefined();
  });

  it("documents both session-cookie and personal API-key authentication", async () => {
    const spec = openApiSpec as any;
    expect(spec.components.securitySchemes.sessionCookie).toBeDefined();
    expect(spec.components.securitySchemes.sessionCookie.type).toBe("apiKey");
    expect(spec.components.securitySchemes.sessionCookie.in).toBe("cookie");
    expect(spec.components.securitySchemes.apiKey.type).toBe("http");
    expect(spec.components.securitySchemes.apiKey.scheme).toBe("bearer");
  });

  it("defines reusable Error and Envelope schemas", async () => {
    const spec = openApiSpec as any;
    expect(spec.components.schemas.Error).toBeDefined();
    expect(spec.components.schemas.Envelope).toBeDefined();
    expect(spec.components.schemas.Schedule).toBeUndefined();
    expect(spec.components.schemas.Actor).toBeDefined();
    expect(spec.components.schemas.KeywordResult).toBeDefined();
    expect(spec.components.schemas.KeywordWatch).toBeDefined();
    expect(spec.components.schemas.Health).toBeDefined();
    expect(spec.components.schemas.Readiness).toBeDefined();
  });

  it("defines reusable error responses under components", async () => {
    const spec = openApiSpec as any;
    expect(spec.components.responses.Unauthorized).toBeDefined();
    expect(spec.components.responses.BadRequest).toBeDefined();
    expect(spec.components.responses.NotFound).toBeDefined();
    expect(spec.components.responses.Forbidden).toBeDefined();
    expect(spec.responses).toBeUndefined();
  });
});

describe("GET /docs", () => {
  it.each(["/docs", "/api/docs", "/api/docs/"])("loads the schema beside %s", async (path) => {
    const app = buildApp();
    const html = await (await app.request("/docs")).text();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeDefined();
    let requestedPath = "";
    const browser = { location: new URL(path, "https://actorconsole.com"), onload: () => {} };
    const bundle = Object.assign(
      (config: { url: string }) => {
        requestedPath = config.url;
      },
      { presets: { apis: {} } },
    );
    new Function("window", "SwaggerUIBundle", script!)(browser, bundle);
    browser.onload();
    const expected = path.startsWith("/api/") ? "/api/openapi.json" : "/openapi.json";
    expect(requestedPath).toBe(expected);
    const api = new Hono().route(path.startsWith("/api/") ? "/api" : "/", openApiRoutes);
    expect((await api.request(requestedPath)).status).toBe(200);
  });

  it("returns HTML with Swagger UI bundle", async () => {
    const app = buildApp();
    const res = await app.request("/docs");
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type") ?? "";
    expect(contentType).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("swagger-ui");
    expect(html).toContain("/openapi.json");
  });
});
