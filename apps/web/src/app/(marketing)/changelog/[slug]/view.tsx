import type { Metadata } from "next";
import {
  absoluteUrl,
  breadcrumbStructuredData,
  createPageMetadata,
  socialImageUrl,
} from "@/lib/seo";
import { JsonLd } from "@/components/seo/json-ld";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getChangelogArticle, type ChangelogArticle } from "@/services/changelog";
import { articleHref } from "@/lib/changelog";
import { ChangelogArticleContent, ChangelogRow } from "@/components/marketing/changelog-article";
import { ChangelogShare } from "@/components/marketing/changelog-share";
import { PublicGridSection } from "@/components/marketing/public-grid-section";

const getArticle = cache(getChangelogArticle);
export const revalidate = 60;
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getArticle((await params).slug);
  if (!data) return { title: "Update not found — ActorConsole", robots: { index: false } };
  const { entry } = data;
  return createPageMetadata({
    title: entry.title,
    description: entry.text.slice(0, 200),
    path: articleHref(entry.slug),
    image: "changelog",
    type: "article",
    publishedTime: `${entry.releaseDate}T00:00:00Z`,
    tags: entry.tags,
  });
}

export default async function ChangelogArticlePage({
  params,
  initialData,
}: Props & { initialData?: { entry: ChangelogArticle; related: ChangelogArticle[] } | null }) {
  const data = initialData !== undefined ? initialData : await getArticle((await params).slug);
  if (!data) notFound();
  return (
    <main className="marketing-page flex-1">
      <JsonLd
        data={breadcrumbStructuredData([
          { name: "Home", path: "/" },
          { name: "Changelog", path: "/changelog" },
          { name: data.entry.title, path: articleHref(data.entry.slug) },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: data.entry.title,
          description: data.entry.text,
          mainEntityOfPage: absoluteUrl(articleHref(data.entry.slug)),
          datePublished: `${data.entry.releaseDate.slice(0, 10)}T00:00:00Z`,
          image: socialImageUrl("changelog"),
          inLanguage: "en",
          publisher: {
            "@id": absoluteUrl("/#organization"),
            "@type": "Organization",
            name: "ActorConsole",
          },
        }}
      />
      <PublicGridSection frameClassName="py-12 sm:py-16">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/changelog"
            className="mb-10 inline-flex items-center gap-2 rounded-sm font-mono text-xs uppercase text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to changelog
          </Link>
          <ChangelogArticleContent entry={data.entry} />
          <div className="mt-10 border-t border-border pt-6">
            <ChangelogShare />
          </div>
          {data.related.length > 0 && (
            <section
              aria-labelledby="related-updates"
              className="mt-12 border-t border-border pt-8"
            >
              <h2 id="related-updates" className="font-display-tight text-2xl font-semibold">
                Related updates
              </h2>
              {data.related.map((entry) => (
                <ChangelogRow key={entry.id} entry={entry} />
              ))}
            </section>
          )}
        </div>
      </PublicGridSection>
    </main>
  );
}
