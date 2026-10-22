/**
 * Blog routes — public read + admin CRUD.
 *
 * Public:
 *   GET /api/blog          — list published posts (paginated)
 *   GET /api/blog/:slug    — get a single published post
 *
 * Admin:
 *   GET    /api/admin/blog      — list all posts (any status)
 *   POST   /api/admin/blog      — create post
 *   PUT    /api/admin/blog/:id  — update post
 *   DELETE /api/admin/blog/:id  — soft-delete (archive)
 *   POST   /api/admin/blog/:id/publish — publish a draft
 *   POST   /api/admin/newsletter/send  — send newsletter to all active subscribers
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@actorconsole/db";
import { requireAdmin } from "../middleware/admin.js";
import { enqueue } from "../lib/queue.js";
import type { AppEnv } from "../app.js";

// ---------------------------------------------------------------------------
// Public blog routes
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(12),
  tag: z.string().optional(),
});

export const blogPublicRoutes = new Hono<AppEnv>()

  .get("/", zValidator("query", listQuerySchema), async (c) => {
    const { page, limit, tag } = c.req.valid("query");
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { status: "PUBLISHED", deletedAt: null };
    if (tag) where.tags = { string_contains: JSON.stringify(tag) };

    const [posts, total] = await Promise.all([
      db.blogPost.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          slug: true,
          title: true,
          excerpt: true,
          coverImage: true,
          publishedAt: true,
          tags: true,
          readingMinutes: true,
          author: { select: { name: true } },
        },
      }),
      db.blogPost.count({ where }),
    ]);

    return c.json({
      ok: true,
      data: posts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  })

  .get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const post = await db.blogPost.findFirst({
      where: { slug, status: "PUBLISHED", deletedAt: null },
      include: { author: { select: { id: true, name: true } } },
    });

    if (!post || post.deletedAt) {
      return c.json({ ok: false, error: { code: "not_found", message: "Post not found" } }, 404);
    }

    return c.json({ ok: true, data: post });
  });

// ---------------------------------------------------------------------------
// Admin blog CRUD
// ---------------------------------------------------------------------------

const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  excerpt: z.string().max(500).optional(),
  content: z.string().min(1),
  coverImage: z.string().url().optional(),
  tags: z.array(z.string()).default([]),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(500).optional(),
  readingMinutes: z.number().int().positive().optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
});

const updatePostSchema = createPostSchema.partial();
const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(120).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  sort: z.enum(["createdAt", "updatedAt", "publishedAt", "title", "status"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const blogAdminRoutes = new Hono<AppEnv>()
  .use("*", requireAdmin())

  // List all posts (any status)
  .get("/", zValidator("query", adminListQuerySchema), async (c) => {
    const { page, limit, search, status, sort, order } = c.req.valid("query");
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { slug: { contains: search } },
        { excerpt: { contains: search } },
      ];
    }
    const [items, total] = await Promise.all([
      db.blogPost.findMany({
        where,
        orderBy: { [sort]: order },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          author: { select: { id: true, name: true, email: true } },
        },
      }),
      db.blogPost.count({ where }),
    ]);
    return c.json({ ok: true, data: { items, total, page, limit } });
  })

  // Get one post for the editor.
  .get("/:id", async (c) => {
    const post = await db.blogPost.findUnique({ where: { id: c.req.param("id") } });
    if (!post) {
      return c.json({ ok: false, error: { code: "not_found", message: "Post not found" } }, 404);
    }
    return c.json({ ok: true, data: post });
  })

  // Create post
  .post("/", zValidator("json", createPostSchema), async (c) => {
    const adminSession = c.get("adminSession");
    const body = c.req.valid("json");

    // Check slug uniqueness
    const existing = await db.blogPost.findUnique({ where: { slug: body.slug } });
    if (existing) {
      return c.json(
        {
          ok: false,
          error: { code: "conflict", message: "A post with this slug already exists." },
        },
        409,
      );
    }

    const post = await db.blogPost.create({
      data: {
        ...body,
        authorId: adminSession.adminId,
        publishedAt: body.status === "PUBLISHED" ? new Date() : null,
      },
    });

    return c.json({ ok: true, data: post }, 201);
  })

  // Update post
  .put("/:id", zValidator("json", updatePostSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const post = await db.blogPost.findUnique({ where: { id } });
    if (!post || post.deletedAt) {
      return c.json({ ok: false, error: { code: "not_found", message: "Post not found" } }, 404);
    }

    // If slug is changing, check uniqueness
    if (body.slug && body.slug !== post.slug) {
      const dup = await db.blogPost.findUnique({ where: { slug: body.slug } });
      if (dup) {
        return c.json(
          {
            ok: false,
            error: { code: "conflict", message: "A post with this slug already exists." },
          },
          409,
        );
      }
    }

    const updated = await db.blogPost.update({
      where: { id },
      data: {
        ...body,
        ...(body.status === "PUBLISHED" && !post.publishedAt ? { publishedAt: new Date() } : {}),
        ...(body.status === "DRAFT" ? { publishedAt: null } : {}),
      },
    });

    return c.json({ ok: true, data: updated });
  })

  // Archive (soft-delete)
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const post = await db.blogPost.findUnique({ where: { id } });
    if (!post) {
      return c.json({ ok: false, error: { code: "not_found", message: "Post not found" } }, 404);
    }

    await db.blogPost.update({
      where: { id },
      data: { status: "ARCHIVED", deletedAt: new Date() },
    });

    return c.json({ ok: true, message: "Post archived." });
  })

  // Publish a draft
  .post("/:id/publish", async (c) => {
    const id = c.req.param("id");
    const post = await db.blogPost.findUnique({ where: { id } });
    if (!post || post.deletedAt) {
      return c.json({ ok: false, error: { code: "not_found", message: "Post not found" } }, 404);
    }

    const updated = await db.blogPost.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedAt: post.publishedAt ?? new Date(),
      },
    });

    return c.json({ ok: true, data: updated });
  });

// ---------------------------------------------------------------------------
// Newsletter send — admin only
// ---------------------------------------------------------------------------

const newsletterSendSchema = z.object({
  idempotencyKey: z.string().min(16).max(128),
  subject: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  articles: z
    .array(
      z.object({
        title: z.string(),
        url: z.string().url(),
        excerpt: z.string(),
        publishedAt: z.string().optional(),
      }),
    )
    .min(1)
    .max(10),
});

export const newsletterSendRoutes = new Hono<AppEnv>()
  .use("*", requireAdmin())
  .get("/campaigns", async (c) => {
    const campaigns = await db.newsletterCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        subject: true,
        title: true,
        status: true,
        totalRecipients: true,
        sentCount: true,
        failedCount: true,
        error: true,
        createdAt: true,
        completedAt: true,
      },
    });
    return c.json({ ok: true, data: campaigns });
  })
  .post("/send", zValidator("json", newsletterSendSchema), async (c) => {
    const body = c.req.valid("json");
    const existing = await db.newsletterCampaign.findUnique({
      where: { idempotencyKey: body.idempotencyKey },
    });
    if (existing) return c.json({ ok: true, data: existing });

    const totalRecipients = await db.newsletterSubscriber.count({ where: { status: "ACTIVE" } });
    if (totalRecipients === 0) {
      return c.json(
        { ok: false, error: { code: "no_recipients", message: "There are no active subscribers." } },
        409,
      );
    }

    const adminSession = c.get("adminSession");
    const campaign = await db.newsletterCampaign.create({
      data: {
        idempotencyKey: body.idempotencyKey,
        subject: body.subject,
        title: body.title,
        articles: body.articles,
        totalRecipients,
        createdById: adminSession.adminId,
      },
    });
    const jobId = await enqueue(
      "newsletter",
      { campaignId: campaign.id },
      { jobId: `newsletter:${campaign.id}` },
    );
    if (!jobId) {
      await db.newsletterCampaign.update({
        where: { id: campaign.id },
        data: { status: "FAILED", error: "Queue is unavailable", completedAt: new Date() },
      });
      return c.json(
        { ok: false, error: { code: "queue_unavailable", message: "Newsletter queue is unavailable." } },
        503,
      );
    }

    return c.json({ ok: true, data: { ...campaign, jobId } }, 202);
  });
