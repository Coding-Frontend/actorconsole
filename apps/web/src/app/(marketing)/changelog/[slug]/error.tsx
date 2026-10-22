"use client";
import { Button } from "@/components/ui/button";
export default function ChangelogArticleError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-4xl px-6 py-20">
      <h1 className="text-3xl font-semibold">This update could not be loaded</h1>
      <p className="text-muted-foreground my-6">Please try again shortly.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
