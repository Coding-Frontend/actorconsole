import type { Metadata } from "next";
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
  return {
    title: `${entry.title} — ActorConsole Changelog`,
    description: entry.text.slice(0, 200),
    alternates: { canonical: articleHref(entry.slug) },
    openGraph: {
      title: entry.title,
      description: entry.text.slice(0, 200),
      type: "article",
      publishedTime: `${entry.releaseDate}T00:00:00Z`,
      tags: entry.tags,
    },
    twitter: { card: "summary", title: entry.title, description: entry.text.slice(0, 200) },
  };
}

export default async function ChangelogArticlePage({
  params,
  initialData,
}: Props & { initialData?: { entry: ChangelogArticle; related: ChangelogArticle[] } | null }) {
  const data = initialData !== undefined ? initialData : await getArticle((await params).slug);
  if (!data) notFound();
  return (
    <main className="marketing-page flex-1">
      <PublicGridSection frameClassName="py-12 sm:py-16">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/changelog"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mb-10 inline-flex items-center gap-2 rounded-sm font-mono text-xs uppercase focus-visible:ring-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to changelog
          </Link>
          <ChangelogArticleContent entry={data.entry} />
          <div className="border-border mt-10 border-t pt-6">
            <ChangelogShare />
          </div>
          {data.related.length > 0 && (
            <section
              aria-labelledby="related-updates"
              className="border-border mt-12 border-t pt-8"
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
