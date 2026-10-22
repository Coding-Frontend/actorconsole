"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CollectionViewMode, ViewModeToggle } from "@/components/ui/view-mode-toggle";

export function BuilderActorViewToggle({ view }: { view: CollectionViewMode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function changeView(nextView: CollectionViewMode) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextView === "grid") params.delete("view");
    else params.set("view", nextView);
    params.delete("actorPage");
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  return (
    <ViewModeToggle
      value={view}
      onValueChange={changeView}
      label="Actor portfolio view"
      className={pending ? "pointer-events-none opacity-60" : undefined}
    />
  );
}
