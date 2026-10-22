import { createContext, useContext, type ReactNode } from "react";
import { Skeleton, SkeletonPageHeader, SkeletonTable } from "../components/ui/skeleton";
import { PublicGridSection } from "../components/marketing/public-grid-section";
import { NavigationContext } from "./navigation";

/** Page fallbacks receive a frame; nested reads stay inside their existing cell. */
export function ContentState({
  children,
  inline = false,
  role,
}: {
  children: ReactNode;
  inline?: boolean;
  role?: "alert" | "status";
}) {
  const { pathname } = useContext(NavigationContext);
  const publicPage = !/^\/(dashboard|admin)(\/|$)/.test(pathname);
  return publicPage && !inline ? (
    <PublicGridSection className="public-content-state" frameClassName="py-16" role={role}>
      {children}
    </PublicGridSection>
  ) : (
    <div role={role} className={inline ? "min-w-0 py-4" : "mx-auto max-w-7xl px-6 py-16"}>
      {children}
    </div>
  );
}

export function ContentLoading({ inline = false }: { inline?: boolean }) {
  if (inline) {
    return (
      <div
        role="status"
        aria-label="Loading content"
        aria-busy="true"
        className="min-w-0 space-y-4"
      >
        <div aria-hidden="true" className="overflow-x-auto">
          <SkeletonTable rows={5} />
        </div>
      </div>
    );
  }
  return (
    <ContentState>
      <div
        role="status"
        aria-label="Loading page content"
        aria-busy="true"
        className="min-w-0 space-y-6"
      >
        <SkeletonPageHeader titleWidth="w-56" descriptionWidth="w-80" />
        <div aria-hidden="true" className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-24" />
          ))}
        </div>
        <div aria-hidden="true" className="border-border bg-card rounded-md border p-5">
          <SkeletonTable rows={5} />
        </div>
      </div>
    </ContentState>
  );
}

export const ContentLoadingContext = createContext<React.ReactNode>(<ContentLoading />);
