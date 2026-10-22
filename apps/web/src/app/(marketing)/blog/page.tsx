import { SERVER_API_BASE_URL } from "@/lib/api-base";
import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/layout";
import { NewsletterCta } from "@/components/marketing/newsletter-cta";
import { PageHero } from "@/components/marketing/page-hero";
import { BlogIndexClient } from "@/components/marketing/blog-index-client";
import { SEEDED_BLOG_POSTS, type MarketingBlogPost } from "@/lib/blog-posts";

export const metadata: Metadata = {
  title: "Blog — ActorConsole",
  description:
    "Product updates, Apify actor development guides, Store optimization tips, and behind-the-scenes from the ActorConsole team.",
  openGraph: {
    title: "ActorConsole Blog",
    description: "Product updates and practical Apify Actor workflow guides.",
  },
};

export const revalidate = 60;

const API_BASE = SERVER_API_BASE_URL;
const BLOG_FETCH_TIMEOUT_MS = 2_500;

interface ApiBlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content?: string | null;
  coverImage: string | null;
  publishedAt: string | null;
  tags: string[] | null;
  readingMinutes: number | null;
  author: { name: string | null; email?: string } | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

interface BlogApiResponse {
  ok: boolean;
  data: ApiBlogPost[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

function normalizePost(post: ApiBlogPost): MarketingBlogPost {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt ?? "A practical note from the ActorConsole team.",
    content: post.content ?? undefined,
    coverImage: post.coverImage ?? null,
    publishedAt: post.publishedAt,
    tags: Array.isArray(post.tags) ? post.tags : [],
    readingMinutes: post.readingMinutes,
    author: post.author,
    seoTitle: post.seoTitle ?? undefined,
    seoDescription: post.seoDescription ?? undefined,
  };
}

async function getPosts(): Promise<MarketingBlogPost[]> {
  try {
    const res = await fetch(`${API_BASE}/blog?limit=50`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(BLOG_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json: BlogApiResponse = await res.json();
    if (!json.ok) return [];
    return Array.isArray(json.data) ? json.data.map(normalizePost) : [];
  } catch {
    return [];
  }
}

export default async function BlogIndexPage() {
  const apiPosts = await getPosts();
  const apiSlugs = new Set(apiPosts.map((post) => post.slug));
  // Seed content is a local development aid only. Production must render the
  // published CMS/API record so editorial pages cannot masquerade as live CMS data.
  const posts =
    process.env.NODE_ENV === "development"
      ? [...apiPosts, ...SEEDED_BLOG_POSTS.filter((post) => !apiSlugs.has(post.slug))]
      : apiPosts;

  return (
    <main className="marketing-page flex-1">
      <PageHero
        tone="ink"
        kicker="Product blog"
        title={<>Product and engineering updates for actor builders.</>}
        description="Guides, strategy, and deep dives into optimizing and automating the work around Apify actors."
      />

      <Section variant="muted">
        <Container>
          <BlogIndexClient posts={posts} />
        </Container>
      </Section>

      <NewsletterCta />
    </main>
  );
}
