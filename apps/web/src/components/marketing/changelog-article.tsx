import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ApifyMarkdown } from "@/components/marketing/apify-markdown";
import { articleHref, CHANGELOG_CATEGORIES, changelogDateLabel, tagLabel } from "@/lib/changelog";
import type { ChangelogArticle } from "@/services/changelog";

export function ChangelogBadge({ category }: Pick<ChangelogArticle, "category">) {
  const config = CHANGELOG_CATEGORIES[category];
  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] uppercase tracking-wide ${config.badge}`}
    >
      {config.label}
    </Badge>
  );
}

export function ChangelogArticleContent({ entry }: { entry: ChangelogArticle }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <ChangelogBadge category={entry.category} />
        <time dateTime={entry.releaseDate} className="text-muted-foreground font-mono text-xs">
          {changelogDateLabel(entry.releaseDate)}
        </time>
        <span className="text-muted-foreground font-mono text-xs">
          {entry.version === "Unreleased" ? entry.version : `v${entry.version}`}
        </span>
      </div>
      <h1 className="font-display-tight mt-6 max-w-3xl break-words text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
        {entry.title}
      </h1>
      {entry.body && entry.body !== entry.text && (
        <p className="text-muted-foreground mt-5 text-lg leading-relaxed">{entry.text}</p>
      )}
      <div className="border-border mt-8 border-t pt-4">
        <ApifyMarkdown markdown={entry.body || entry.text} />
      </div>
      {entry.tags.length > 0 && (
        <nav aria-label="Update product areas" className="mt-8 flex flex-wrap gap-2">
          {entry.tags.map((tag) => (
            <Link
              key={tag}
              href={`/changelog?year=${entry.releaseDate.slice(0, 4)}&tag=${encodeURIComponent(tag)}`}
              className="border-border hover:border-signal-orange focus-visible:ring-ring rounded-sm border px-3 py-1.5 font-mono text-xs focus-visible:outline-none focus-visible:ring-2"
            >
              {tagLabel(tag)}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

export function ChangelogRow({ entry }: { entry: ChangelogArticle }) {
  return (
    <article className="border-border/70 border-b py-6 last:border-b-0 sm:py-7">
      <div className="flex flex-wrap items-center gap-3">
        <time
          dateTime={entry.releaseDate}
          className="text-muted-foreground min-w-14 font-mono text-xs uppercase"
        >
          {changelogDateLabel(entry.releaseDate, true)}
        </time>
        <ChangelogBadge category={entry.category} />
        <span className="text-muted-foreground font-mono text-[10px]">
          {entry.version === "Unreleased" ? entry.version : `v${entry.version}`}
        </span>
      </div>
      <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <h3 className="min-w-0 flex-1 break-words text-base font-semibold leading-relaxed sm:text-lg">
          <Link
            href={articleHref(entry.slug)}
            className="hover:text-signal-orange focus-visible:ring-ring rounded-sm focus-visible:outline-none focus-visible:ring-2"
          >
            {entry.title}
          </Link>
        </h3>
        {entry.tags.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:max-w-56 sm:justify-end">
            <Link
              href={`/changelog?year=${entry.releaseDate.slice(0, 4)}&tag=${encodeURIComponent(entry.tags[0])}`}
              className="text-muted-foreground hover:text-foreground break-all font-mono text-[10px] uppercase underline-offset-4 hover:underline"
            >
              {tagLabel(entry.tags[0])}
            </Link>
            {entry.tags.length > 1 && (
              <details className="text-muted-foreground font-mono text-[10px]">
                <summary
                  className="focus-visible:ring-ring cursor-pointer rounded-sm focus-visible:ring-2"
                  aria-label={`Show ${entry.tags.length - 1} more product tags for ${entry.title}`}
                >
                  +{entry.tags.length - 1}
                </summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  {entry.tags.slice(1).map((tag) => (
                    <Link
                      key={tag}
                      href={`/changelog?year=${entry.releaseDate.slice(0, 4)}&tag=${encodeURIComponent(tag)}`}
                      className="hover:text-foreground underline"
                    >
                      {tagLabel(tag)}
                    </Link>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
