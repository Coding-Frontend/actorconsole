"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { MarketingBlogPost } from "@/lib/blog-posts";
import { CollectionViewMode, ViewModeToggle } from "@/components/ui/view-mode-toggle";

const PAGE_SIZE = 6;

const visualStyles = [
  "from-signal-orange/25 via-signal-orange/5 to-card",
  "from-signal-blue/25 via-signal-blue/5 to-card",
  "from-signal-green/20 via-signal-green/5 to-card",
  "from-signal-orange/15 via-signal-blue/5 to-card",
];

export function BlogIndexClient({ posts }: { posts: MarketingBlogPost[] }) {
  const [category, setCategory] = useState("All");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<CollectionViewMode>(() =>
    typeof window !== "undefined" &&
    window.localStorage.getItem("actorconsole:blog-view") === "list"
      ? "list"
      : "grid",
  );

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(posts.flatMap((post) => post.tags))).sort()],
    [posts],
  );

  const filteredPosts = useMemo(
    () => (category === "All" ? posts : posts.filter((post) => post.tags.includes(category))),
    [category, posts],
  );
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / PAGE_SIZE));
  const visiblePosts = filteredPosts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function changeCategory(nextCategory: string) {
    setCategory(nextCategory);
    setPage(1);
  }

  function changePage(nextPage: number) {
    setPage(Math.min(totalPages, Math.max(1, nextPage)));
    window.scrollTo({ top: 520, behavior: "smooth" });
  }

  function changeView(nextView: CollectionViewMode) {
    setView(nextView);
    window.localStorage.setItem("actorconsole:blog-view", nextView);
  }

  return (
    <div>
      <div className="border-border/80 mb-10 flex flex-col gap-5 border-b pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="type-kicker eyebrow-line text-signal-blue">Browse the desk</p>
          <h2 className="font-display-tight text-foreground mt-4 text-3xl sm:text-4xl">
            Notes for the work around the build.
          </h2>
        </div>
        <p className="text-muted-foreground max-w-sm text-sm leading-6 lg:text-right">
          Filter by the decision you are making, then keep the useful context close to the next
          release.
        </p>
      </div>

      <div className="mb-8">
        <div
          className="topic-rail -mx-6 flex snap-x snap-proximity gap-2 overflow-x-auto px-6 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
          role="tablist"
          aria-label="Post categories"
        >
          {categories.map((item) => {
            const selected = item === category;
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => changeCategory(item)}
                className={
                  selected
                    ? "bg-primary text-primary-foreground border-primary shrink-0 snap-start rounded-full border px-3.5 py-2 text-xs font-semibold"
                    : "border-border bg-card text-muted-foreground hover:border-signal-orange/50 hover:text-foreground shrink-0 snap-start rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors"
                }
              >
                {item === "All" ? "All posts" : item}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 sm:justify-end">
          <span className="text-muted-foreground whitespace-nowrap text-xs sm:hidden">
            Swipe topics →
          </span>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground whitespace-nowrap text-xs">
              {filteredPosts.length} {filteredPosts.length === 1 ? "note" : "notes"}
            </span>
            <ViewModeToggle value={view} onValueChange={changeView} label="Blog posts view" />
          </div>
        </div>
      </div>

      {visiblePosts.length > 0 ? (
        <div
          className={
            view === "grid"
              ? "blueprint-bento sm:grid-cols-2 lg:grid-cols-3"
              : "border-border bg-card divide-border divide-y border"
          }
        >
          {visiblePosts.map((post, index) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className="group block h-full">
              <Card
                className={
                  view === "grid"
                    ? "blueprint-cell bg-card hover:bg-fog/60 flex h-full flex-col overflow-hidden rounded-none border-0 shadow-none transition-colors"
                    : "hover:bg-fog/60 flex min-h-44 overflow-hidden rounded-none border-0 shadow-none transition-colors sm:flex-row"
                }
              >
                <div
                  className={
                    view === "grid"
                      ? "border-border/70 relative aspect-[1.55] overflow-hidden border-b"
                      : "border-border/70 relative aspect-[1.55] shrink-0 overflow-hidden border-b sm:aspect-auto sm:w-56 sm:border-b-0 sm:border-r"
                  }
                >
                  {post.coverImage ? (
                    <Image src={post.coverImage} alt="" fill className="object-cover" />
                  ) : (
                    <div
                      className={`bg-gradient-to-br ${visualStyles[index % visualStyles.length]} flex h-full items-end justify-between p-5`}
                    >
                      <span className="data-stamp text-foreground/55">
                        FIELD NOTE / 0{index + 1}
                      </span>
                      <BookOpen
                        className="text-foreground/55 h-7 w-7"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </div>
                  )}
                </div>
                <CardHeader className="flex-1 pb-3">
                  <div className="flex flex-wrap gap-1.5">
                    {post.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <CardTitle className="text-foreground mt-3 text-[19px] leading-[1.08]">
                    {post.title}
                  </CardTitle>
                  <p className="text-muted-foreground mt-3 line-clamp-3 text-sm leading-6">
                    {post.excerpt}
                  </p>
                </CardHeader>
                <CardContent className="pt-0 sm:min-w-56">
                  <div className="border-border/70 text-muted-foreground flex items-center justify-between border-t pt-4 text-xs">
                    <span>
                      {post.publishedAt ? formatDate(post.publishedAt) : "Draft"}
                      {post.readingMinutes ? ` · ${post.readingMinutes} min read` : ""}
                    </span>
                    <ArrowRight className="text-signal-orange h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="blueprint-frame bg-card p-12 text-center">
          <BookOpen className="text-muted-foreground/50 mx-auto h-9 w-9" />
          <p className="text-foreground mt-4 font-semibold">No notes in this category yet.</p>
          <button
            type="button"
            onClick={() => changeCategory("All")}
            className="text-signal-orange mt-3 text-sm font-semibold hover:underline"
          >
            Browse all posts
          </button>
        </div>
      )}

      {totalPages > 1 ? (
        <nav
          className="border-border/80 mt-10 flex items-center justify-between border-t pt-6"
          aria-label="Blog pagination"
        >
          <button
            type="button"
            onClick={() => changePage(page - 1)}
            disabled={page === 1}
            className="border-border bg-card text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <div className="flex items-center gap-1.5" aria-label={`Page ${page} of ${totalPages}`}>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => changePage(pageNumber)}
                aria-current={pageNumber === page ? "page" : undefined}
                className={
                  pageNumber === page
                    ? "bg-primary text-primary-foreground h-8 w-8 rounded-md text-xs font-semibold"
                    : "border-border bg-card text-muted-foreground hover:text-foreground h-8 w-8 rounded-md border text-xs font-semibold transition-colors"
                }
              >
                {pageNumber}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => changePage(page + 1)}
            disabled={page === totalPages}
            className="border-border bg-card text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      ) : null}
    </div>
  );
}
