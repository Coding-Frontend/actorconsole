import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), readme: vi.fn() }));
vi.mock("@actorconsole/apify", () => ({ getPublicActor: mocks.actor }));
vi.mock("../../../src/lib/public-actor-content.js", () => ({ getPublicActorReadme: mocks.readme }));
import { GET } from "../../../src/routes/web-auth/seo.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: "immutable", username: "alice", name: "scraper", isPublic: true, title: "A useful public Actor title", description: "A".repeat(100) });
  mocks.readme.mockResolvedValue("# Usage\n" + "A".repeat(350));
});

describe("public SEO documentation checks", () => {
  it("assesses README checks from the public Markdown fallback", async () => {
    const response = await GET(new Request("https://actorconsole.com/api/public/seo?actor=alice/scraper"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.readme).toHaveBeenCalledWith("alice", "scraper");
    expect(body.data.assessedChecks).toBe(5);
    expect(body.data.checks.slice(3).every((check: { passed: boolean }) => check.passed)).toBe(true);
  });
  it("uses supplied README without an extra upstream read", async () => {
    mocks.actor.mockResolvedValue({ isPublic: true, name: "scraper", description: "A".repeat(100), readme: "# Usage\n" + "A".repeat(350) });
    const body = await (await GET(new Request("https://actorconsole.com/api/public/seo?actor=alice/scraper"))).json();
    expect(body.data.assessedChecks).toBe(5);
    expect(mocks.readme).not.toHaveBeenCalled();
  });
  it("keeps unavailable documentation unscored", async () => {
    mocks.readme.mockResolvedValue(null);
    const body = await (await GET(new Request("https://actorconsole.com/api/public/seo?actor=alice/scraper"))).json();
    expect(body.data.assessedChecks).toBe(3);
    expect(body.data.checks.slice(3).every((check: { passed: null }) => check.passed === null)).toBe(true);
  });
  it("rejects invalid or external URLs before any upstream request", async () => {
    const response = await GET(new Request("https://actorconsole.com/api/public/seo?actor=https://example.com/alice/scraper"));
    expect(response.status).toBe(400);
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.readme).not.toHaveBeenCalled();
  });
});
