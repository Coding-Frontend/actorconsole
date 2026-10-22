import { z } from "zod";
import type { Prisma } from "@actorconsole/db";

export const changelogCategories = ["RELEASE", "IMPROVEMENT", "RETIRED"] as const;
export const changelogTags = z
  .array(
    z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(64),
  )
  .max(12)
  .transform((tags) => [...new Set(tags)]);
export const changelogSlug = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine((slug) => !["feed", "entries", "health"].includes(slug), "This URL slug is reserved");
export const changelogDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid release date");

export const changelogFields = {
  title: z.string().trim().min(1).max(240).optional(),
  slug: changelogSlug.optional(),
  body: z.string().max(100_000).nullable().optional(),
  category: z.enum(changelogCategories).optional(),
  tags: changelogTags.optional(),
};

export const publicChangelogSelect = {
  id: true,
  title: true,
  slug: true,
  text: true,
  category: true,
  type: true,
  releaseDate: true,
  version: true,
  sortOrder: true,
  tags: { select: { tag: true }, orderBy: { tag: "asc" as const } },
} satisfies Prisma.ChangelogEntrySelect;

type PublicRow = Prisma.ChangelogEntryGetPayload<{ select: typeof publicChangelogSelect }>;
export function publicChangelogEntry(row: PublicRow) {
  return {
    ...row,
    title: row.title ?? row.text.slice(0, 240),
    slug: row.slug ?? `update-${row.id}`,
    releaseDate: row.releaseDate.toISOString().slice(0, 10),
    tags: row.tags.map(({ tag }) => tag),
  };
}
