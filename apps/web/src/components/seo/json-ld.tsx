import { serializeJsonLd } from "@/lib/seo";

/** Render public structured data in the server HTML, escaping CMS content. */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
