import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockFindManyPosts = vi.fn();
const mockFindUniquePost = vi.fn();
const mockCountPosts = vi.fn();
const mockFindFirstPost = vi.fn();
const mockCreatePost = vi.fn();
const mockUpdatePost = vi.fn();

vi.mock("@actorconsole/db", () => ({
  db: {
    blogPost: {
      findMany: (...args: unknown[]) => mockFindManyPosts(...args),
      findUnique: (...args: unknown[]) => mockFindUniquePost(...args),
      findFirst: (...args: unknown[]) => mockFindFirstPost(...args),
      count: (...args: unknown[]) => mockCountPosts(...args),
      create: (...args: unknown[]) => mockCreatePost(...args),
      update: (...args: unknown[]) => mockUpdatePost(...args),
    },
  },
}));

vi.mock("../../src/lib/analytics.js", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("../../src/lib/email.js", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@actorconsole/shared", () => ({
  getLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
  renderNewsletterEmail: vi.fn().mockReturnValue("<html></html>"),
}));

vi.mock("../../src/middleware/admin.js", () => ({
  requireAdmin: () => async (c: any, next: any) => {
    c.set("adminSession", { adminId: "u1", email: "admin@test.com", role: "ADMIN" });
    await next();
  },
}));

import { blogPublicRoutes, blogAdminRoutes } from "../../src/routes/blog.js";

function buildPublicApp() {
  const app = new Hono();
  app.route("/blog", blogPublicRoutes);
  return app;
}

function buildAdminApp() {
  const app = new Hono();
  app.use("*", async (c: any, next: any) => {
    c.set("adminSession", { adminId: "u1", email: "admin@test.com", role: "ADMIN" });
    await next();
  });
  app.route("/admin/blog", blogAdminRoutes);
  return app;
}

describe("Blog routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Public routes", () => {
    describe("GET /blog/", () => {
      it("returns paginated published posts", async () => {
        mockFindManyPosts.mockResolvedValueOnce([
          { id: "p1", slug: "hello-world", title: "Hello World" },
        ]);
        mockCountPosts.mockResolvedValueOnce(1);

        const res = await buildPublicApp().request("/blog");
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.data).toHaveLength(1);
        expect(body.pagination.total).toBe(1);
      });

      it("returns empty array when no posts", async () => {
        mockFindManyPosts.mockResolvedValueOnce([]);
        mockCountPosts.mockResolvedValueOnce(0);

        const res = await buildPublicApp().request("/blog");
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.data).toEqual([]);
      });

      it("supports page and limit query params", async () => {
        mockFindManyPosts.mockResolvedValueOnce([]);
        mockCountPosts.mockResolvedValueOnce(0);

        const res = await buildPublicApp().request("/blog?page=2&limit=5");
        expect(res.status).toBe(200);
        expect(mockFindManyPosts).toHaveBeenCalledWith(
          expect.objectContaining({ skip: 5, take: 5 }),
        );
      });
    });

    describe("GET /blog/:slug", () => {
      it("returns a published post by slug", async () => {
        mockFindFirstPost.mockResolvedValueOnce({
          id: "p1",
          slug: "hello-world",
          title: "Hello World",
          status: "PUBLISHED",
        });

        const res = await buildPublicApp().request("/blog/hello-world");
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.data.slug).toBe("hello-world");
      });

      it("returns 404 for non-existent slug", async () => {
        mockFindFirstPost.mockResolvedValueOnce(null);
        const res = await buildPublicApp().request("/blog/non-existent");
        expect(res.status).toBe(404);
      });
    });
  });

  describe("Admin routes", () => {
    describe("GET /admin/blog/", () => {
      it("returns paginated posts for admin", async () => {
        mockFindManyPosts.mockResolvedValueOnce([
          { id: "p1", title: "Draft Post", status: "DRAFT" },
        ]);
        mockCountPosts.mockResolvedValueOnce(1);

        const res = await buildAdminApp().request("/admin/blog");
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.data.items).toHaveLength(1);
        expect(body.data.total).toBe(1);
      });

      it("filters, sorts, and paginates the admin blog registry", async () => {
        mockFindManyPosts.mockResolvedValueOnce([]);
        mockCountPosts.mockResolvedValueOnce(0);

        const res = await buildAdminApp().request(
          "/admin/blog?search=release&status=PUBLISHED&sort=title&order=asc&page=2&limit=25",
        );

        expect(res.status).toBe(200);
        expect(mockFindManyPosts).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              status: "PUBLISHED",
              OR: [
                { title: { contains: "release" } },
                { slug: { contains: "release" } },
                { excerpt: { contains: "release" } },
              ],
            },
            orderBy: { title: "asc" },
            skip: 25,
            take: 25,
          }),
        );
      });
    });

    describe("POST /admin/blog/", () => {
      it("creates a new blog post", async () => {
        mockFindUniquePost.mockResolvedValueOnce(null);
        mockCreatePost.mockResolvedValueOnce({ id: "p1", slug: "new-post", status: "DRAFT" });

        const res = await buildAdminApp().request("/admin/blog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "New Post",
            slug: "new-post",
            content: "Some content here",
          }),
        });
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.data.status).toBe("DRAFT");
      });

      it("returns 409 when slug already exists", async () => {
        mockFindUniquePost.mockResolvedValueOnce({ id: "existing", slug: "taken-slug" });

        const res = await buildAdminApp().request("/admin/blog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Duplicate",
            slug: "taken-slug",
            content: "Content",
          }),
        });
        expect(res.status).toBe(409);
      });

      it("rejects invalid slug format", async () => {
        const res = await buildAdminApp().request("/admin/blog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Bad Slug",
            slug: "Invalid Slug!",
            content: "Content",
          }),
        });
        expect(res.status).toBe(400);
      });
    });

    describe("PUT /admin/blog/:id", () => {
      it("updates an existing post", async () => {
        mockFindUniquePost.mockResolvedValueOnce({ id: "p1", slug: "old-slug" });
        mockUpdatePost.mockResolvedValueOnce({ id: "p1", title: "Updated" });

        const res = await buildAdminApp().request("/admin/blog/p1", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
      });

      it("returns 404 when post does not exist", async () => {
        mockFindUniquePost.mockResolvedValueOnce(null);

        const res = await buildAdminApp().request("/admin/blog/nonexistent", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        });
        expect(res.status).toBe(404);
      });

      it("returns 409 when new slug conflicts", async () => {
        mockFindUniquePost
          .mockResolvedValueOnce({ id: "p1", slug: "old-slug" })
          .mockResolvedValueOnce({ id: "p2", slug: "taken-slug" });

        const res = await buildAdminApp().request("/admin/blog/p1", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: "taken-slug" }),
        });
        expect(res.status).toBe(409);
      });
    });

    describe("DELETE /admin/blog/:id", () => {
      it("archives a post (soft-delete)", async () => {
        mockFindUniquePost.mockResolvedValueOnce({ id: "p1", status: "PUBLISHED" });
        mockUpdatePost.mockResolvedValueOnce({});

        const res = await buildAdminApp().request("/admin/blog/p1", {
          method: "DELETE",
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
      });

      it("returns 404 when post does not exist", async () => {
        mockFindUniquePost.mockResolvedValueOnce(null);
        const res = await buildAdminApp().request("/admin/blog/nonexistent", {
          method: "DELETE",
        });
        expect(res.status).toBe(404);
      });
    });

    describe("POST /admin/blog/:id/publish", () => {
      it("publishes a draft post", async () => {
        mockFindUniquePost.mockResolvedValueOnce({ id: "p1", status: "DRAFT", publishedAt: null });
        mockUpdatePost.mockResolvedValueOnce({ id: "p1", status: "PUBLISHED" });

        const res = await buildAdminApp().request("/admin/blog/p1/publish", {
          method: "POST",
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
      });

      it("returns 404 when post does not exist", async () => {
        mockFindUniquePost.mockResolvedValueOnce(null);
        const res = await buildAdminApp().request("/admin/blog/nonexistent/publish", {
          method: "POST",
        });
        expect(res.status).toBe(404);
      });
    });
  });
});
