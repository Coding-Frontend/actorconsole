import { contentSitemapXml } from "@/lib/sitemap-xml";

// New articles can be published independently of web builds.
export const dynamic = "force-dynamic";

export const GET = contentSitemapXml;
