import { DocGuideContent } from "@/components/docs/doc-guide-content";
import { findDocGuide } from "@/lib/documentation";

export default function DocsPage() {
  return <DocGuideContent guide={findDocGuide("getting-started")!} />;
}
