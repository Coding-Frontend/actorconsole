import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DocGuideContent } from "@/components/docs/doc-guide-content";
import { DOC_GUIDES, findDocGuide } from "@/lib/documentation";

export function generateStaticParams() {
  return DOC_GUIDES.map(({ id: slug }) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = findDocGuide(slug);

  return {
    title: guide?.title ?? "Documentation",
    description: guide?.summary,
  };
}

export default async function DocSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = findDocGuide(slug);
  if (!guide) notFound();

  return <DocGuideContent guide={guide} />;
}
