import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { POLICY_META, policyMetaBySlug } from "@actorconsole/shared";
import { SERVER_API_BASE_URL } from "@/lib/api-base";
import { Container, Section } from "@/components/ui/layout";
import { PolicyToc } from "@/components/marketing/policy-toc";
import { policyHeadingId } from "@/components/marketing/policy-heading";
import { PageHero } from "@/components/marketing/page-hero";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";

function headingText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(headingText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return headingText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return POLICY_META.map((p) => ({ slug: p.slug.toLowerCase() }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug: raw } = await params;
  const meta = policyMetaBySlug(raw);
  if (!meta) return { title: "Not found" };
  return {
    title: `${meta.title} — ActorConsole`,
    description: meta.summary,
    robots: { index: true, follow: true },
  };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params;
  const meta = policyMetaBySlug(raw);
  if (!meta) notFound();

  // Published policies are fetched from the API; unavailable content stays unpublished.
  let policy: { title: string; body: string; version: string; publishedAt: Date | null } | null =
    null;
  try {
    const response = await fetch(SERVER_API_BASE_URL + "/policies/" + meta.slug, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!response.ok && response.status !== 404) throw new Error("Policy API unavailable");
    const row = response.ok ? (await response.json()).data : null;
    if (row)
      policy = {
        title: row.title,
        body: row.body,
        version: row.version,
        publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
      };
  } catch {
    // The policy API is temporarily unavailable.
  }

  if (!policy) {
    return (
      <main className="marketing-page flex-1">
        <PageHero
          tone="ink"
          kicker="Legal / publication pending"
          title={meta.title}
          description="This policy has not been published yet. Check back after the next policy release."
        />
      </main>
    );
  }

  return (
    <main className="marketing-page flex-1">
      <PageHero
        tone="fog"
        kicker="Legal / published policy"
        title={policy.title}
        description={
          <>
            Version {policy.version}
            {policy.publishedAt && (
              <>
                {" · "}Published{" "}
                {policy.publishedAt.toLocaleDateString("en-IN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </>
            )}
          </>
        }
        aside={
          <div className="border-border bg-card border p-5 sm:p-6">
            <p className="type-kicker text-signal-blue">Policy overview</p>
            <p className="font-display-tight text-foreground mt-5 text-3xl">
              Version {policy.version}
            </p>
            <p className="text-muted-foreground mt-3 text-sm leading-6">{meta.summary}</p>
          </div>
        }
      />

      <Section variant="muted">
        <Container className="max-w-5xl">
          <div className="blueprint-bento lg:grid-cols-[220px_1fr]">
            <aside className="border-border border-b p-5 lg:hidden">
              <details>
                <summary className="text-foreground cursor-pointer text-sm font-semibold">
                  Jump to a section
                </summary>
                <div className="mt-4">
                  <PolicyToc body={policy.body} />
                </div>
              </details>
            </aside>
            <aside className="hidden p-6 lg:block">
              <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto">
                <PolicyToc body={policy.body} />
              </div>
            </aside>
            <article className="policy-content min-w-0 p-6 sm:p-8 lg:p-10">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h2: ({ children }) => (
                    <h2 id={policyHeadingId(headingText(children))} tabIndex={-1}>
                      {children}
                    </h2>
                  ),
                  table: ({ children }) => (
                    <div className="policy-table-scroll">
                      <table>{children}</table>
                    </div>
                  ),
                }}
              >
                {policy.body}
              </ReactMarkdown>
            </article>
          </div>
        </Container>
      </Section>
    </main>
  );
}
