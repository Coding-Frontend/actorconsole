import { createPageMetadata } from "@/lib/seo";
import { DocGuideContent } from "@/components/docs/doc-guide-content";
import { findDocGuide } from "@/lib/documentation";

export const metadata = createPageMetadata({
  title: "Documentation & Getting Started",
  description:
    "Set up ActorConsole, connect Apify, research the Store, manage publishing, and understand your workspace costs with practical guides.",
  path: "/docs",
  image: "docs",
});

export default function DocsPage() {
  return <DocGuideContent guide={findDocGuide("getting-started")!} />;
}
