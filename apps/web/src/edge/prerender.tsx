import { renderToString } from "react-dom/server.browser";
import { PublicLocation } from "./navigation";
import { MarketingHeader } from "../components/marketing/header";
import { MarketingFooter } from "../components/marketing/footer";
import { DOC_GUIDES } from "../lib/documentation";
import { DocGuideContent } from "../components/docs/doc-guide-content";
import { DocsShell } from "../components/docs/docs-shell";
import { publicDocument } from "../../../../.deploy/pages/public-document.js";
import { PublicContent } from "../components/marketing/public-content";

/** Documentation is source-controlled; it never needs a request-time Worker. */
export function documentationHtml(template: string) {
  return [
    { path: "/docs", guide: DOC_GUIDES[0] },
    ...DOC_GUIDES.map((guide) => ({ path: `/docs/${guide.id}`, guide })),
  ].map(({ path, guide }) => {
    const content = renderToString(
      <PublicLocation url={`${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:8080"}${path}`}>
        <div className="marketing-grid-page flex min-h-screen flex-col">
          <MarketingHeader />
          <PublicContent>
            <DocsShell>
              <DocGuideContent guide={guide} />
            </DocsShell>
          </PublicContent>
          <MarketingFooter homeGrid />
        </div>
      </PublicLocation>,
    );
    return {
      path,
      html: publicDocument(
        template,
        { path, title: guide.title, description: guide.summary },
        { content },
      ),
    };
  });
}
