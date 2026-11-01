import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/seo";
import { DOC_GUIDES } from "../lib/documentation";
import { publishedSitemapEntries } from "../lib/published-sitemap";

const BASE_URL = SITE_URL;

// Content is published after the web image is built; never freeze a build-time
// empty feed into the deployed sitemap. Public content reads have their own TTL.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const marketingPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/features`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/pricing`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/customers`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/builders`, changeFrequency: "weekly", priority: 0.8 },
    ...["research", "tools/seo", "tools/pricing", "actors/compare", "builders/compare"].map(
      (path) => ({
        url: `${BASE_URL}/${path}`,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }),
    ),
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/blog`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/docs`, changeFrequency: "weekly", priority: 0.8 },
    ...DOC_GUIDES.map(({ id }) => ({
      url: `${BASE_URL}/docs/${id}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    { url: `${BASE_URL}/changelog`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE_URL}/faq`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/status`, changeFrequency: "daily", priority: 0.5 },
    { url: `${BASE_URL}/contact`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/legal/terms`, changeFrequency: "yearly", priority: 0.3 },
    {
      url: `${BASE_URL}/legal/privacy`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/legal/cookies`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/legal/refund`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    { url: `${BASE_URL}/legal/aup`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/legal/dpa`, changeFrequency: "yearly", priority: 0.3 },
    {
      url: `${BASE_URL}/chrome-extension/privacy`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  return [...marketingPages, ...(await publishedSitemapEntries())];
}
