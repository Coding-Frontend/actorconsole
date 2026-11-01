import { createRequire } from "node:module";
const require = createRequire(new URL("../../packages/db/package.json", import.meta.url));
const { PrismaClient } = require("@prisma/client");

export async function seedLaunchContent(suffix) {
  const db = new PrismaClient();
  try {
    const author = await db.user.create({
      data: { email: `content-${suffix}@example.test`, name: "E2E content author" },
    });
    for (const slug of ["TERMS", "PRIVACY", "COOKIES", "REFUND", "AUP", "DPA"]) {
      await db.policy.upsert({
        where: { slug_version: { slug, version: "e2e-1" } },
        create: {
          slug,
          version: "e2e-1",
          title: `${slug} test policy`,
          body: "Test policy in the isolated E2E database only.",
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
        update: {},
      });
    }
    for (const [status, deletedAt, label] of [
      ["PUBLISHED", null, "published"],
      ["DRAFT", null, "draft"],
      ["PUBLISHED", new Date(), "deleted"],
    ]) {
      await db.blogPost.create({
        data: {
          authorId: author.id,
          slug: `e2e-${label}-blog-${suffix}`,
          title: `E2E ${label} blog`,
          content: "Published content for launch checks.",
          status,
          deletedAt,
          publishedAt: status === "PUBLISHED" ? new Date() : null,
        },
      });
    }
    for (const isPublished of [true, false]) {
      await db.changelogEntry.create({
        data: {
          version: "e2e",
          releaseDate: new Date("2025-01-01"),
          title: "E2E release",
          slug: `e2e-${isPublished ? "published" : "draft"}-changelog-${suffix}`,
          text: "A release from a previous year.",
          type: "FEATURE",
          isPublished,
          publishedAt: isPublished ? new Date() : null,
        },
      });
    }
  } finally {
    await db.$disconnect();
  }
}
