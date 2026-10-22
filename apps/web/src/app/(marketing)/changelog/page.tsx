import type { Metadata } from "next";

import { getLogger } from "@actorconsole/shared";

import { ChangelogList } from "@/components/marketing/changelog-list";
import { PublicGridSection } from "@/components/marketing/public-grid-section";

import { getChangelogListing } from "@/services/changelog";

import { changelogQuery } from "@/lib/changelog";

export const metadata: Metadata = {
  title: "Changelog — ActorConsole",

  description: "Latest updates, features, and improvements to ActorConsole.",

  alternates: { canonical: "/changelog", types: { "application/rss+xml": "/changelog/feed" } },
};

export const revalidate = 60;

const log = getLogger("web:changelog");

export default async function ChangelogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = changelogQuery(await searchParams);

  let data;

  try {
    data = await getChangelogListing(query);
  } catch (err) {
    log.warn({ err }, "Could not load public changelog");
  }

  return (
    <main className="marketing-page flex-1">
      {data ? (
        <ChangelogList key={query.toString()} data={data} query={query.toString()} />
      ) : (
        <PublicGridSection frameClassName="py-20">
          <div className="mx-auto max-w-4xl">
            <h1 className="font-display-tight text-4xl font-semibold">Changelog</h1>
            <p role="alert" className="text-muted-foreground mt-8">
              The changelog is temporarily unavailable. Please try again shortly.
            </p>
            <a
              href={`/changelog?${query}`}
              className="text-signal-blue mt-4 inline-block underline"
            >
              Try again
            </a>
          </div>
        </PublicGridSection>
      )}
    </main>
  );
}
