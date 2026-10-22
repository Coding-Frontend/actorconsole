import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { campaignFind, campaignCreate, campaignUpdate, subscriberCount, enqueue } = vi.hoisted(() => ({
  campaignFind: vi.fn(),
  campaignCreate: vi.fn(),
  campaignUpdate: vi.fn(),
  subscriberCount: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("@actorconsole/db", () => ({
  db: {
    newsletterCampaign: {
      findUnique: (...args: unknown[]) => campaignFind(...args),
      findMany: vi.fn().mockResolvedValue([]),
      create: (...args: unknown[]) => campaignCreate(...args),
      update: (...args: unknown[]) => campaignUpdate(...args),
    },
    newsletterSubscriber: { count: (...args: unknown[]) => subscriberCount(...args) },
  },
}));

vi.mock("../../src/lib/queue.js", () => ({
  enqueue: (...args: unknown[]) => enqueue(...args),
}));

vi.mock("../../src/middleware/admin.js", () => ({
  requireAdmin: () => async (c: any, next: any) => {
    c.set("adminSession", { adminId: "admin-1", email: "admin@example.com", role: "ADMIN" });
    await next();
  },
}));

import { newsletterSendRoutes } from "../../src/routes/blog.js";

function app() {
  const instance = new Hono();
  instance.route("/admin/newsletter", newsletterSendRoutes);
  return instance;
}

const requestBody = {
  idempotencyKey: "campaign-request-0001",
  subject: "ActorConsole weekly digest",
  title: "This week in ActorConsole",
  articles: [
    {
      title: "Production actors",
      url: "https://actorconsole.com/blog/production-actors",
      excerpt: "A practical guide.",
    },
  ],
};

describe("newsletter campaign queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    campaignFind.mockResolvedValue(null);
    subscriberCount.mockResolvedValue(4);
    campaignCreate.mockResolvedValue({ id: "campaign-1", status: "QUEUED" });
    campaignUpdate.mockResolvedValue({});
    enqueue.mockResolvedValue("job-1");
  });

  it("persists and queues a campaign", async () => {
    const response = await app().request("/admin/newsletter/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    expect(response.status).toBe(202);
    expect(campaignCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: requestBody.idempotencyKey,
        totalRecipients: 4,
        createdById: "admin-1",
      }),
    });
    expect(enqueue).toHaveBeenCalledWith(
      "newsletter",
      { campaignId: "campaign-1" },
      { jobId: "newsletter:campaign-1" },
    );
  });

  it("rejects a send with no active recipients", async () => {
    subscriberCount.mockResolvedValueOnce(0);
    const response = await app().request("/admin/newsletter/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    expect(response.status).toBe(409);
    expect(campaignCreate).not.toHaveBeenCalled();
  });

  it("marks the campaign failed if Redis is unavailable", async () => {
    enqueue.mockResolvedValueOnce(null);
    const response = await app().request("/admin/newsletter/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    expect(response.status).toBe(503);
    expect(campaignUpdate).toHaveBeenCalledWith({
      where: { id: "campaign-1" },
      data: expect.objectContaining({ status: "FAILED", error: "Queue is unavailable" }),
    });
  });
});
