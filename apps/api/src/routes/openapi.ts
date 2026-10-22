import { Hono } from "hono";
import type { AppEnv } from "../app.js";

/**
 * OpenAPI 3.1 spec + Swagger UI for the ActorConsole public API.
 *
 * This is a hand-curated spec covering the public/authed surface that
 * external integrators and the dashboard use. Internal routes (admin,
 * tickets, etc.) are intentionally not documented here.
 *
 * We hand-curate instead of generating from route definitions because:
 *   1. Not all routes are stable — internal admin endpoints change weekly
 *   2. We want the public surface to look polished, not auto-generated
 *   3. The spec serves as living documentation, not just a tool input
 *
 * The Swagger UI is mounted at /docs and the raw JSON at /openapi.json.
 * Both are unauthenticated; the API endpoints themselves still require
 * a session.
 */
export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "ActorConsole API",
    version: "1.2.0",
    description:
      "Authenticated API for tracked Apify actors, Store research, reviewed AI changes, " +
      "publishing, usage, and the MCP server. Responses use the envelope " +
      "{ ok: boolean, data?: T, error?: { code, message } }.",
    contact: { name: "ActorConsole Engineering", url: `${process.env.AUTH_URL ?? "http://localhost:8080"}/docs` },
    license: { name: "MIT", identifier: "MIT" },
  },
  servers: [
    { url: process.env.API_BASE_URL ?? "http://localhost:4000", description: "Configured API" },
    { url: "http://localhost:4000", description: "Local API" },
  ],
  security: [{ sessionCookie: [] }, { apiKey: [] }],
  tags: [
    { name: "Health", description: "Liveness and readiness probes." },
    { name: "Actors", description: "Tracked Apify actors and reviewable Store changes." },
    {
      name: "Analytics",
      description: "Workspace usage, cost, revenue, profit, and coverage reports.",
    },
    {
      name: "Apify",
      description: "Workspace Apify credential status and independently available surfaces.",
    },
    { name: "Keywords", description: "Apify Store search and first-party research metrics." },
    { name: "Publishing", description: "Quota-aware ordered Store publishing schedules." },
    { name: "MCP", description: "Authenticated Model Context Protocol capability discovery." },
    { name: "Account", description: "Workspace MCP credential management." },
  ],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "authjs.session-token",
        description: "Auth.js session cookie from the ActorConsole web app.",
      },
      apiKey: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "al_<64 hexadecimal characters>",
        description:
          "Workspace MCP credential used by the ActorConsole MCP bridge. Send it as Authorization: Bearer al_...",
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["ok", "error"],
        properties: {
          ok: { type: "boolean", enum: [false] },
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", example: "not_found" },
              message: { type: "string", example: "Actor not found" },
              details: { type: "object", additionalProperties: true },
            },
          },
        },
      },
      Envelope: {
        type: "object",
        required: ["ok"],
        properties: {
          ok: { type: "boolean" },
          data: { description: "Operation-specific payload when ok=true." },
          error: { $ref: "#/components/schemas/Error/properties/error" },
        },
      },
      Actor: {
        type: "object",
        required: ["id", "apifyActorId", "username", "actorName"],
        properties: {
          id: { type: "string", example: "clx_actor_abc123" },
          apifyActorId: { type: "string", example: "compdata~google-maps-scraper" },
          username: { type: "string", example: "compdata" },
          actorName: { type: "string", example: "google-maps-scraper" },
          title: { type: "string", nullable: true },
          description: { type: "string", nullable: true },
          currentImageUrl: { type: "string", format: "uri", nullable: true },
          currentCopy: { type: "object", nullable: true, additionalProperties: true },
          currentPricing: { type: "object", nullable: true, additionalProperties: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      KeywordResult: {
        type: "object",
        required: ["id", "name", "difficultyScore", "opportunityScore"],
        properties: {
          id: { type: "string" },
          username: { type: "string" },
          name: { type: "string" },
          title: { type: "string", nullable: true },
          description: { type: "string", nullable: true },
          totalRuns: { type: "integer", nullable: true },
          usersTotal: { type: "integer", nullable: true },
          monthlyUsers: { type: "integer", nullable: true },
          rating: { type: "number", nullable: true },
          difficultyScore: { type: "integer", minimum: 0, maximum: 100 },
          opportunityScore: { type: "integer", minimum: 0, maximum: 100 },
          demandSignal: { type: "integer", minimum: 0 },
          url: { type: "string", format: "uri", nullable: true },
        },
      },
      KeywordWatch: {
        type: "object",
        required: ["id", "keyword", "normalizedKeyword", "searchCount"],
        properties: {
          id: { type: "string" },
          keyword: { type: "string" },
          normalizedKeyword: { type: "string" },
          searchCount: { type: "integer" },
          latestResultCount: { type: "integer" },
          difficultyScore: { type: "number", nullable: true },
          repeatUseRate: { type: "number", nullable: true },
          lastSearchedAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      PricingRecommendation: {
        type: "object",
        required: ["query", "recommendedAmount", "pricedCompetitorCount", "competitors"],
        properties: {
          query: { type: "string" },
          currentPricing: { type: "number", nullable: true },
          recommendedAmount: { type: "number", nullable: true },
          marketMedian: { type: "number", nullable: true },
          pricedCompetitorCount: { type: "integer" },
          competitors: { type: "array", items: { type: "object", additionalProperties: true } },
          methodology: { type: "string" },
        },
      },
      Usage: {
        type: "object",
        required: [
          "apifyActorId",
          "windowDays",
          "usageCostUsd",
          "totalRuns",
          "successfulRuns",
          "failedRuns",
          "abortedRuns",
          "timedOutRuns",
          "resultCount",
          "daily",
        ],
        properties: {
          apifyActorId: { type: "string" },
          windowDays: { type: "integer" },
          usageCostUsd: { type: "number" },
          totalRuns: { type: "integer" },
          successfulRuns: { type: "integer" },
          failedRuns: { type: "integer" },
          abortedRuns: { type: "integer" },
          timedOutRuns: { type: "integer" },
          resultCount: { type: "integer" },
          daily: { type: "array", items: { type: "object", additionalProperties: true } },
          accountingNote: { type: "string" },
        },
      },
      Health: {
        type: "object",
        required: ["service", "uptimeSec"],
        properties: {
          service: { type: "string", example: "actorconsole-api" },
          version: { type: "string" },
          env: { type: "string" },
          uptimeSec: { type: "integer" },
        },
      },
      Readiness: {
        type: "object",
        required: ["ready", "checks"],
        properties: {
          ready: { type: "boolean" },
          timestamp: { type: "string", format: "date-time" },
          checks: { type: "object", additionalProperties: true },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: "Authentication required.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      Forbidden: {
        description: "The plan or feature flag does not allow this operation.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      BadRequest: {
        description: "Invalid request.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      NotFound: {
        description: "Resource not found.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      Unavailable: {
        description: "A required integration or feature is unavailable.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Liveness probe",
        security: [],
        responses: {
          "200": {
            description: "Service is alive.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } },
          },
        },
      },
    },
    "/health/ready": {
      get: {
        tags: ["Health"],
        summary: "Readiness probe",
        security: [],
        responses: {
          "200": {
            description: "Ready.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } },
          },
          "503": { $ref: "#/components/responses/Unavailable" },
        },
      },
    },
    "/metrics": {
      get: {
        tags: ["Health"],
        summary: "Expose Prometheus metrics",
        security: [],
        parameters: [
          {
            name: "Authorization",
            in: "header",
            required: false,
            schema: { type: "string", example: "Bearer <METRICS_TOKEN>" },
          },
        ],
        responses: {
          "200": { description: "Prometheus text exposition." },
          "401": { description: "Metrics token is invalid or missing." },
        },
      },
    },
    "/actors": {
      get: {
        tags: ["Actors"],
        summary: "List tracked actors",
        responses: {
          "200": {
            description: "Tracked actors.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    data: { type: "array", items: { $ref: "#/components/schemas/Actor" } },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/apify/operations": {
      get: {
        tags: ["Apify"],
        summary: "Read available Apify API and Console surfaces",
        description:
          "Returns independent availability and count summaries for API-key resources and Console-only organization, proxy, billing, and notification surfaces. A failed Console credential does not hide API-key inventory.",
        responses: {
          "200": {
            description: "Credential-scoped Apify operations summary.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Envelope" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/actors/sync": {
      post: {
        tags: ["Actors"],
        summary: "Sync the connected Apify actor list",
        responses: {
          "200": {
            description: "Sync completed.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/actors/available": {
      get: {
        tags: ["Actors"],
        summary: "List Actors owned by the connected Apify API-key account",
        description:
          "Reads every page from Apify using the workspace API key and marks Actors already tracked by the current workspace. This endpoint does not import or modify Actors.",
        responses: {
          "200": {
            description: "Live Apify Actor list.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/actors/{apifyActorId}": {
      parameters: [
        {
          name: "apifyActorId",
          in: "path",
          required: true,
          schema: { type: "string" },
          example: "compdata~google-maps-scraper",
        },
      ],
      get: {
        tags: ["Actors"],
        summary: "Get synchronized tracked Actor details",
        responses: {
          "200": {
            description: "Actor details.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Actors"],
        summary: "Update the actor title in Apify Store",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title"],
                properties: { title: { type: "string", minLength: 1, maxLength: 200 } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Title updated." },
          "400": { $ref: "#/components/responses/BadRequest" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/actors/{apifyActorId}/analytics": {
      get: {
        tags: ["Actors"],
        summary: "Read Apify Console owner analytics for an Actor",
        parameters: [
          {
            name: "apifyActorId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "month",
            in: "query",
            required: false,
            description: "Analytics month in YYYY-MM-01 format.",
            schema: { type: "string", pattern: "^\\d{4}-\\d{2}-01$" },
          },
        ],
        responses: {
          "200": {
            description: "Actor breakdown, cost, run, user, and profit-margin analytics.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/actors/optimization/runs": {
      get: {
        tags: ["Actors"],
        summary: "List bulk and single-Actor improvement generations",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "kind", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Paginated improvement generation history." },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Actors"],
        summary: "Queue a reviewable Actor improvement generation",
        description:
          "Generates selected listing, source schema, README, and pay-per-event pricing proposals. It does not publish changes.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["actorIds"],
                properties: {
                  actorIds: {
                    type: "array",
                    minItems: 1,
                    maxItems: 10000,
                    items: { type: "string" },
                  },
                  kind: { type: "string" },
                  fields: {
                    type: "array",
                    minItems: 1,
                    items: {
                      type: "string",
                      enum: ["title", "description", "pricing"],
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "202": { description: "Audit queued." },
          "400": { $ref: "#/components/responses/BadRequest" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/actors/optimization/runs/{runId}": {
      get: {
        tags: ["Actors"],
        summary: "Get a bulk Actor audit and its proposals",
        parameters: [{ name: "runId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Audit run and proposal results." },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/actors/optimization/runs/{runId}/approve": {
      post: {
        tags: ["Actors"],
        summary: "Approve exact proposed fields for application to Apify",
        description:
          "Only explicitly listed fields are applied. MCP credentials require actors:write and an idempotency key.",
        parameters: [
          { name: "runId", in: "path", required: true, schema: { type: "string" } },
          {
            name: "Idempotency-Key",
            in: "header",
            required: false,
            schema: { type: "string", minLength: 8, maxLength: 191 },
          },
        ],
        responses: {
          "202": { description: "Approved application jobs queued." },
          "403": { $ref: "#/components/responses/Forbidden" },
          "409": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/actors/{apifyActorId}/rewrite-copy": {
      post: {
        tags: ["Actors"],
        summary: "Generate copy variants for review",
        parameters: [
          { name: "apifyActorId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { type: "object", properties: { apifyActorId: { type: "string" } } },
            },
          },
        },
        responses: {
          "200": { description: "Variants generated." },
          "403": { $ref: "#/components/responses/Forbidden" },
          "422": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/actors/{apifyActorId}/copy": {
      put: {
        tags: ["Actors"],
        summary: "Update reviewed Actor listing fields",
        parameters: [
          { name: "apifyActorId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  seoTitle: { type: "string" },
                  seoDescription: { type: "string" },
                },
                example: {
                  title: "A clearer Store title",
                  description: "A reviewed description.",
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Actor listing updated." },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/actors/{apifyActorId}/categories/feedback": {
      post: {
        tags: ["Actors"],
        summary: "Send an Apify-managed Store category correction",
        parameters: [
          { name: "apifyActorId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["details"],
                properties: {
                  details: { type: "string", minLength: 10, maxLength: 2000 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Category feedback submitted to Apify." },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "422": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/actors/{apifyActorId}/pricing/recommendation": {
      get: {
        tags: ["Actors"],
        summary: "Compare live Store prices and return a median recommendation",
        parameters: [
          { name: "apifyActorId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Pricing recommendation.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    data: { $ref: "#/components/schemas/PricingRecommendation" },
                  },
                },
              },
            },
          },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/actors/{apifyActorId}/pricing": {
      get: {
        tags: ["Actors"],
        summary: "Read synchronized current Actor pricing",
        parameters: [
          { name: "apifyActorId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Current stored pay-per-event pricing and sync timestamp." },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      put: {
        tags: ["Actors"],
        summary: "Publish reviewed pricing",
        parameters: [
          { name: "apifyActorId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["pricing"],
                properties: {
                  pricing: {
                    type: "object",
                    required: ["model", "events"],
                    properties: {
                      model: { type: "string", enum: ["PAY_PER_EVENT"] },
                      amount: { type: "number", nullable: true },
                      events: { type: "object", minProperties: 1, additionalProperties: true },
                    },
                  },
                  reason: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Pricing published." },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/actors/{apifyActorId}/pricing/history": {
      get: {
        tags: ["Actors"],
        summary: "Read recorded Actor pricing changes",
        parameters: [
          { name: "apifyActorId", in: "path", required: true, schema: { type: "string" } },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 180, default: 60 },
          },
        ],
        responses: {
          "200": { description: "Pricing changes ordered from newest to oldest." },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/actors/{apifyActorId}/snapshots": {
      get: {
        tags: ["Actors"],
        summary: "List actor snapshots",
        parameters: [
          { name: "apifyActorId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Snapshots." },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/actors/{apifyActorId}/usage": {
      get: {
        tags: ["Actors"],
        summary: "Read stored daily usage",
        parameters: [
          { name: "apifyActorId", in: "path", required: true, schema: { type: "string" } },
          {
            name: "days",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 365, default: 30 },
          },
        ],
        responses: {
          "200": {
            description: "Usage summary.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    data: { $ref: "#/components/schemas/Usage" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/actors/usage": {
      get: {
        tags: ["Analytics"],
        summary: "Read workspace operational usage analytics",
        parameters: [
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
          { name: "actorIds", in: "query", schema: { type: "string" } },
          {
            name: "apifyActorId",
            in: "query",
            schema: { type: "string" },
            description: "Filter to one Actor by Apify ID; cannot be combined with actorIds.",
          },
          { name: "granularity", in: "query", schema: { type: "string", enum: ["day", "month"] } },
          {
            name: "mode",
            in: "query",
            schema: { type: "string", enum: ["absolute", "cumulative"] },
          },
        ],
        responses: { "200": { description: "Cached-first Actor usage report." } },
      },
    },
    "/actors/costs": {
      get: {
        tags: ["Analytics"],
        summary: "Read workspace cost analytics",
        parameters: [
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
          { name: "actorIds", in: "query", schema: { type: "string" } },
          {
            name: "apifyActorId",
            in: "query",
            schema: { type: "string" },
            description: "Filter to one Actor by Apify ID; cannot be combined with actorIds.",
          },
          { name: "granularity", in: "query", schema: { type: "string", enum: ["day", "month"] } },
          {
            name: "mode",
            in: "query",
            schema: { type: "string", enum: ["absolute", "cumulative"] },
          },
          { name: "day", in: "query", schema: { type: "string", format: "date" } },
        ],
        responses: { "200": { description: "Direct and allocated workspace cost report." } },
      },
    },
    "/actors/revenue": {
      get: {
        tags: ["Analytics"],
        summary: "Read workspace revenue and profit analytics",
        parameters: [
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
          { name: "actorIds", in: "query", schema: { type: "string" } },
          {
            name: "apifyActorId",
            in: "query",
            schema: { type: "string" },
            description: "Filter to one Actor by Apify ID; cannot be combined with actorIds.",
          },
          { name: "granularity", in: "query", schema: { type: "string", enum: ["day", "month"] } },
          {
            name: "mode",
            in: "query",
            schema: { type: "string", enum: ["absolute", "cumulative"] },
          },
          { name: "day", in: "query", schema: { type: "string", format: "date" } },
        ],
        responses: {
          "200": { description: "Revenue, cost, net profit, margin, and coverage report." },
        },
      },
    },
    "/keywords/search": {
      get: {
        tags: ["Keywords"],
        summary: "Search the synchronized public Apify Store catalog",
        parameters: [
          {
            name: "q",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 120 },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
          },
        ],
        responses: {
          "200": { description: "Results and transparent research metrics." },
          "400": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/keywords/watchlist": {
      get: {
        tags: ["Keywords"],
        summary: "List watched keywords",
        responses: {
          "200": {
            description: "Watchlist.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    data: { type: "array", items: { $ref: "#/components/schemas/KeywordWatch" } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Keywords"],
        summary: "Add or update a watched keyword",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["keyword"],
                properties: { keyword: { type: "string", minLength: 1, maxLength: 120 } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Watch updated." },
          "201": { description: "Watch created." },
        },
      },
    },
    "/keywords/watchlist/{id}": {
      delete: {
        tags: ["Keywords"],
        summary: "Remove a watched keyword",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Watch removed." },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/bulk-publishing/schedules": {
      get: {
        tags: ["Publishing"],
        summary: "List publishing schedules and recent runs",
        responses: { "200": { description: "Workspace-scoped publishing schedules." } },
      },
      post: {
        tags: ["Publishing"],
        summary: "Create an ordered publishing schedule",
        description: "Schedules start paused unless enabled is explicitly true.",
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            required: false,
            schema: { type: "string", minLength: 8, maxLength: 191 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "actorIds"],
                properties: {
                  name: { type: "string", maxLength: 100 },
                  actorIds: { type: "array", minItems: 1, items: { type: "string" } },
                  cronExpr: { type: "string", default: "0 2 * * *" },
                  dailyLimit: { type: "integer", minimum: 1, maximum: 100, default: 5 },
                  enabled: { type: "boolean", default: false },
                  idempotencyKey: { type: "string", maxLength: 191 },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Publishing schedule created." },
          "400": { $ref: "#/components/responses/BadRequest" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/bulk-publishing/actors/status": {
      patch: {
        tags: ["Publishing"],
        summary: "Queue an immediate Actor Store lifecycle change",
        description:
          "Creates durable operation history. Clearing maintenance always clears deprecated status too.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["actorIds"],
                properties: {
                  actorIds: { type: "array", minItems: 1, items: { type: "string" } },
                  underMaintenance: { type: "boolean" },
                  isDeprecated: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "202": { description: "Status operation persisted and queued." },
          "400": { $ref: "#/components/responses/BadRequest" },
          "503": { $ref: "#/components/responses/Unavailable" },
        },
      },
    },
    "/bulk-publishing/status-operations": {
      get: {
        tags: ["Publishing"],
        summary: "List durable Actor Store status operations",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "action", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Paginated workspace status-operation history." } },
      },
    },
    "/bulk-publishing/status-operations/{id}": {
      get: {
        tags: ["Publishing"],
        summary: "Get a status operation and its Actor calls",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Operation totals and ordered per-Actor results." },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/bulk-publishing/schedules/{id}": {
      get: {
        tags: ["Publishing"],
        summary: "Get a publishing schedule, Actor queue, and recent runs",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Publishing schedule." } },
      },
      patch: {
        tags: ["Publishing"],
        summary: "Update schedule configuration or replace its Actor queue",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "Idempotency-Key", in: "header", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Publishing schedule updated." } },
      },
      delete: {
        tags: ["Publishing"],
        summary: "Delete a publishing schedule",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "Idempotency-Key", in: "header", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Publishing schedule deleted." } },
      },
    },
    "/bulk-publishing/schedules/{id}/run": {
      post: {
        tags: ["Publishing"],
        summary: "Run a publishing schedule immediately",
        description:
          "Requires publishing:run. Stops on Apify's daily publication limit and preserves pending Actors.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          {
            name: "Idempotency-Key",
            in: "header",
            required: true,
            schema: { type: "string", minLength: 8, maxLength: 191 },
          },
        ],
        responses: {
          "200": { description: "Run queued with a stable job identifier." },
          "409": { description: "The schedule already has an active run." },
        },
      },
    },
    "/bulk-publishing/schedules/{id}/runs": {
      get: {
        tags: ["Publishing"],
        summary: "List publishing execution records",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Recent publishing runs." } },
      },
    },
    "/bulk-publishing/schedules/{id}/runs/{runId}": {
      get: {
        tags: ["Publishing"],
        summary: "Get an Actor-level publishing run result",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "runId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Run totals, stop reason, and per-Actor results." } },
      },
    },
    "/mcp/info": {
      get: {
        tags: ["MCP"],
        summary: "Check MCP access and list tool names",
        responses: {
          "200": { description: "MCP capabilities." },
          "403": { $ref: "#/components/responses/Forbidden" },
          "503": { $ref: "#/components/responses/Unavailable" },
        },
      },
    },
    "/mcp/workspace": {
      get: {
        tags: ["MCP"],
        summary: "Get the workspace bound to an MCP credential",
        responses: {
          "200": { description: "Bound workspace metadata." },
          "403": { $ref: "#/components/responses/Forbidden" },
          "503": { $ref: "#/components/responses/Unavailable" },
        },
      },
    },
    "/mcp/usage": {
      get: {
        tags: ["MCP"],
        summary: "Get per-tool MCP usage for the current credential",
        parameters: [
          { name: "days", in: "query", schema: { type: "integer", minimum: 1, maximum: 90 } },
        ],
        responses: {
          "200": { description: "Per-tool calls, failures, latency, and last-use timestamps." },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/mcp/health": {
      get: {
        tags: ["MCP"],
        summary: "Check the configured MCP HTTP transport",
        responses: {
          "200": { description: "MCP transport is healthy." },
          "403": { $ref: "#/components/responses/Forbidden" },
          "503": { $ref: "#/components/responses/Unavailable" },
        },
      },
    },
    "/account/api-keys": {
      get: {
        tags: ["Account"],
        summary: "List MCP credentials for the active workspace",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 500, default: 25 },
          },
        ],
        responses: { "200": { description: "MCP credential metadata." } },
      },
      post: {
        tags: ["Account"],
        summary: "Create an MCP credential for the active workspace",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", minLength: 1, maxLength: 100 },
                  permissions: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: [
                        "workspace:read",
                        "actors:read",
                        "actors:sync",
                        "actors:optimize",
                        "actors:write",
                        "notifications:read",
                        "notifications:write",
                        "usage:read",
                        "pricing:read",
                        "pricing:write",
                        "publishing:read",
                        "publishing:write",
                        "publishing:run",
                      ],
                    },
                  },
                  actorIds: { type: "array", items: { type: "string" }, maxItems: 100 },
                  expiresAt: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created. The secret is returned once." },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/account/api-keys/{id}/rotate": {
      post: {
        tags: ["Account"],
        summary: "Rotate an active workspace MCP credential",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Rotated. The replacement secret is returned once." },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/account/api-keys/{id}": {
      patch: {
        tags: ["Account"],
        summary: "Edit an active workspace MCP credential",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "actorIds"],
                properties: {
                  name: { type: "string", minLength: 1, maxLength: 100 },
                  permissions: { type: "array", items: { type: "string" } },
                  actorIds: { type: "array", items: { type: "string" }, maxItems: 100 },
                  expiresAt: { type: ["string", "null"], format: "date-time" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Updated credential metadata." },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Account"],
        summary: "Revoke a workspace MCP credential",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Key revoked." },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/account/deletion": {
      get: {
        tags: ["Account"],
        summary: "Read the current account deletion grace-period state",
        responses: { "200": { description: "Deletion state." } },
      },
    },
    "/account/deletion/cancel": {
      post: {
        tags: ["Account"],
        summary: "Cancel a scheduled account deletion",
        responses: {
          "200": { description: "Deletion cancelled." },
          "409": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/account/2fa": {
      get: {
        tags: ["Account"],
        summary: "Read two-factor authentication status",
        responses: { "200": { description: "Two-factor status." } },
      },
    },
    "/account/2fa/setup": {
      post: {
        tags: ["Account"],
        summary: "Create a TOTP setup secret",
        responses: {
          "200": { description: "TOTP secret and provisioning URI." },
          "409": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/account/2fa/confirm": {
      post: {
        tags: ["Account"],
        summary: "Confirm a TOTP code and enable two-factor authentication",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["code"],
                properties: { code: { type: "string", minLength: 6, maxLength: 20 } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Two-factor enabled with one-time recovery codes." },
          "400": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
  },
} as const;

export const openApiRoutes = new Hono<AppEnv>()
  .get("/openapi.json", (c) => c.json(openApiSpec))
  .get("/docs", (c) => {
    // Minimal Swagger UI shell. We avoid the heavy @hono/swagger-ui
    // middleware so this works in serverless edge runtimes; the
    // UI is served from the official CDN.
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ActorConsole API Docs</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <style>
    body { margin: 0; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: new URL(window.location.pathname.replace(/\\/docs\\/?$/, "/openapi.json"), window.location.origin).pathname,
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout",
      });
    };
  </script>
</body>
</html>`;
    return c.html(html);
  });
