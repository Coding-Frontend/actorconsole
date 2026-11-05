import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import FaqPage from "@/app/(marketing)/faq/page";
import { DocGuideContent } from "@/components/docs/doc-guide-content";
import { findDocGuide } from "@/lib/documentation";
import { absoluteUrl } from "@/lib/seo";
import { PRODUCT_FAQ_GROUPS } from "@/lib/product-faq";

afterEach(() => vi.unstubAllGlobals());

function inspectHtml(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  const structured = [...root.querySelectorAll('script[type="application/ld+json"]')].map(
    (script) => JSON.parse(script.textContent!),
  );
  root.querySelectorAll("script").forEach((script) => script.remove());
  return { root, structured };
}

describe("server-rendered search content", () => {
  it("serves real product answers in the initial HTML when no CMS FAQs are published", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ ok: true, data: { groups: [] } })),
    );
    const { root, structured } = inspectHtml(renderToStaticMarkup(await FaqPage()));
    const faq = structured.find((data) => data["@type"] === "FAQPage");
    expect(faq.mainEntity).toHaveLength(PRODUCT_FAQ_GROUPS.flatMap((group) => group.items).length);
    for (const question of faq.mainEntity) {
      expect(root.textContent).toContain(question.name);
      expect(root.textContent).toContain(question.acceptedAnswer.text);
    }
    expect(
      root.querySelector('input[aria-label="Search frequently asked questions"]'),
    ).not.toBeNull();
    expect(root.querySelector('a[href="/docs/apify-connection"]')).not.toBeNull();
    expect(root.textContent).not.toContain("No FAQs published");
  });

  it("keeps product help available during a CMS outage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("CMS unavailable")));
    const { root } = inspectHtml(renderToStaticMarkup(await FaqPage()));
    expect(root.textContent).toContain("What is ActorConsole?");
    expect(root.querySelector('[role="status"]')?.textContent).toContain("temporarily unavailable");
  });

  it("uses a published answer once and escapes CMS markup in structured data", async () => {
    const answer = "A published answer with </script><script>alert(1)</script> text.";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ok: true,
          data: {
            groups: [
              {
                category: "General",
                items: [
                  {
                    id: "cms-overview",
                    category: "General",
                    question: "What is ActorConsole?",
                    answer,
                  },
                ],
              },
            ],
          },
        }),
      ),
    );
    const html = renderToStaticMarkup(await FaqPage());
    const { root, structured } = inspectHtml(html);
    const faq = structured.find((data) => data["@type"] === "FAQPage");
    const matching = faq.mainEntity.filter(
      (item: { name: string }) => item.name === "What is ActorConsole?",
    );
    expect(matching).toHaveLength(1);
    expect(matching[0].acceptedAnswer.text).toBe(answer);
    expect(root.textContent).toContain(answer);
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it.each(["getting-started", "first-workspace"])(
    "identifies a guide and its canonical hierarchy: %s",
    (id) => {
      const guide = findDocGuide(id)!;
      const path = id === "getting-started" ? "/docs" : `/docs/${id}`;
      const { root, structured } = inspectHtml(
        renderToStaticMarkup(<DocGuideContent guide={guide} />),
      );
      const article = structured.find((data) => data["@type"] === "TechArticle");
      const breadcrumb = structured.find((data) => data["@type"] === "BreadcrumbList");
      expect(article.mainEntityOfPage).toBe(absoluteUrl(path));
      expect(article.headline).toBe(root.querySelector("h1")?.textContent);
      expect(root.textContent).toContain(article.description);
      expect(breadcrumb.itemListElement.at(-1).item).toBe(absoluteUrl(path));
      expect(article.dateModified).toBeUndefined();
    },
  );
});
