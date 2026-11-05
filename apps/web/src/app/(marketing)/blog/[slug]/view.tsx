import {
  breadcrumbStructuredData,
  createPageMetadata,
  absoluteUrl,
  serializeJsonLd,
  socialImageUrl,
} from "@/lib/seo";
import { JsonLd } from "@/components/seo/json-ld";
import { SERVER_API_BASE_URL } from "@/lib/api-base";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, Clock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { NewsletterCta } from "@/components/marketing/newsletter-cta";
import { PageHero } from "@/components/marketing/page-hero";
import { getLogger } from "@actorconsole/shared";
import { getSeededBlogPost, type MarketingBlogPost } from "@/lib/blog-posts";

export const revalidate = 60;

const API_BASE = SERVER_API_BASE_URL;
const BLOG_FETCH_TIMEOUT_MS = 2_500;
const log = getLogger("web:blog");

export function normalizePost(data: any): MarketingBlogPost {
  return {
    id: String(data.id ?? data.slug),
    slug: String(data.slug),
    title: String(data.title),
    excerpt: data.excerpt ?? "A practical note from the ActorConsole team.",
    content: data.content ?? "",
    coverImage: data.coverImage ?? null,
    publishedAt: data.publishedAt ?? null,
    updatedAt: data.updatedAt ?? null,
    tags: Array.isArray(data.tags) ? data.tags : typeof data.tags === "string" ? [data.tags] : [],
    readingMinutes: data.readingMinutes ?? null,
    author: data.author ?? null,
    seoTitle: data.seoTitle ?? undefined,
    seoDescription: data.seoDescription ?? undefined,
  };
}

function postMetadata(post: MarketingBlogPost): Metadata {
  return createPageMetadata({
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt || post.title,
    path: `/blog/${encodeURIComponent(post.slug)}`,
    image: "blog",
    coverImage: post.coverImage,
    type: "article",
    publishedTime: post.publishedAt ?? undefined,
    modifiedTime: post.updatedAt ?? undefined,
    tags: post.tags,
    author: post.author?.name,
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const seededPost = process.env.NODE_ENV === "development" ? getSeededBlogPost(slug) : null;
  try {
    const res = await fetch(`${API_BASE}/blog/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(BLOG_FETCH_TIMEOUT_MS),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.ok && json.data) return postMetadata(normalizePost(json.data));
    }
  } catch (error) {
    log.warn({ error, slug }, "Could not load blog metadata");
  }
  return seededPost
    ? postMetadata(seededPost)
    : { title: "Post unavailable", robots: { index: false, follow: false } };
}

export default async function BlogPostPage({
  params,
  initialData,
}: {
  params: Promise<{ slug: string }>;
  initialData?: MarketingBlogPost | null;
}) {
  const { slug } = await params;

  let post: MarketingBlogPost | null = initialData ?? null;
  if (initialData === undefined)
    try {
      const res = await fetch(`${API_BASE}/blog/${encodeURIComponent(slug)}`, {
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(BLOG_FETCH_TIMEOUT_MS),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.ok) post = normalizePost(json.data);
      }
    } catch (error) {
      log.warn({ error, slug }, "Could not load blog post");
    }

  if (process.env.NODE_ENV === "development") post ??= getSeededBlogPost(slug);

  if (!post) notFound();

  return (
    <main className="marketing-page flex-1">
      <JsonLd
        data={breadcrumbStructuredData([
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
          { name: post.title, path: `/blog/${encodeURIComponent(post.slug)}` },
        ])}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            description: post.excerpt,
            mainEntityOfPage: absoluteUrl(`/blog/${encodeURIComponent(post.slug)}`),
            image: socialImageUrl("blog", post.coverImage),
            ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
            ...(post.updatedAt ? { dateModified: post.updatedAt } : {}),
            inLanguage: "en",
            author: post.author?.name
              ? { "@type": "Person", name: post.author.name }
              : {
                  "@id": absoluteUrl("/#organization"),
                  "@type": "Organization",
                  name: "ActorConsole",
                },
            publisher: {
              "@id": absoluteUrl("/#organization"),
              "@type": "Organization",
              name: "ActorConsole",
              logo: { "@type": "ImageObject", url: absoluteUrl("/web-app-manifest-512x512.png") },
            },
          }),
        }}
      />
      <PageHero
        tone="ink"
        kicker="Product blog / field note"
        title={post.title}
        description={post.excerpt ?? "A practical note from the ActorConsole team."}
        aside={
          <div className="border border-white/15 bg-white/[0.045] p-5 sm:p-6">
            <Button
              variant="outline"
              size="sm"
              className="border-white/25 bg-transparent text-white hover:border-white/50 hover:bg-white/10 hover:text-white"
              asChild
            >
              <Link href="/blog">
                <ArrowLeft className="mr-1 h-4 w-4" />
                All posts
              </Link>
            </Button>
            <div className="mt-5 flex flex-wrap gap-2">
              {post.tags.map((tag: string) => (
                <Badge key={tag} variant="outline" className="border-white/25 text-white/75">
                  {tag}
                </Badge>
              ))}
            </div>
            <div className="mt-5 space-y-2 border-t border-white/15 pt-4 text-sm text-white/60">
              {post.publishedAt && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-signal-orange" />
                  <time dateTime={post.publishedAt}>
                    {new Date(post.publishedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                </span>
              )}
              {post.updatedAt && post.updatedAt !== post.publishedAt && (
                <span>
                  Updated{" "}
                  <time dateTime={post.updatedAt}>
                    {new Date(post.updatedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                </span>
              )}
              {post.readingMinutes && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-signal-orange" />
                  {post.readingMinutes} min read
                </span>
              )}
              {post.author?.name && <span>By {post.author.name}</span>}
            </div>
          </div>
        }
      />

      <Section variant="muted">
        <Container className="max-w-3xl">
          <article className="blueprint-frame prose prose-gray dark:prose-invert max-w-none bg-card p-6 sm:p-8 lg:p-10">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content ?? ""}</ReactMarkdown>
          </article>
        </Container>
      </Section>

      <NewsletterCta />
    </main>
  );
}
