"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { Accordion } from "@/components/ui/accordion";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

interface FaqGroup {
  category: string;
  items: FaqItem[];
}

export function FaqSearch({ groups }: { groups: FaqGroup[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return groups;
    const q = query.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  const totalCount = filtered.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="space-y-6">
      {/* Search input */}
      <div className="relative">
        <Search className="text-slate absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search questions..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="border-border bg-card text-foreground placeholder:text-muted-foreground focus:border-signal-orange/30 focus:ring-signal-orange/10 w-full rounded-sm border py-3 pl-11 pr-4 text-sm transition-colors focus:outline-none focus:ring-2"
        />
        {query && (
          <span className="text-slate absolute right-4 top-1/2 -translate-y-1/2 text-xs">
            {totalCount} result{totalCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Filtered groups */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <Search className="text-slate/50 mx-auto h-8 w-8" />
          <p className="text-muted-foreground mt-3 text-sm">
            No results for &ldquo;{query}&rdquo;. Try a different search term.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {filtered.map((group) => (
            <div key={group.category} className="blueprint-bento lg:grid-cols-[0.38fr_1fr]">
              <h2 className="font-display text-foreground p-6 text-xl font-bold capitalize sm:p-8 sm:text-2xl">
                {group.category} Questions
              </h2>
              <div className="blueprint-cell border-0 p-5 sm:p-7">
                <Accordion items={group.items} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
