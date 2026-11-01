import type { Metadata } from "next";

export const SITE_NAME = "ActorConsole";
export const SITE_TITLE = "DevOps Platform for Apify Actor Builders";
export const SITE_DESCRIPTION =
  "Research Apify Store demand, improve Actor listings, schedule publishing, and track usage costs and available creator revenue in one workspace.";

// Use the real public origin even when a deployment omits its public URL setting.
export const SITE_URL = new URL(
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://actorconsole.com",
).origin;

export function absoluteUrl(path: string): string {
  return new URL(path, `${SITE_URL}/`).toString();
}

export type SocialImage =
  | "home"
  | "features"
  | "pricing"
  | "customers"
  | "research"
  | "builders"
  | "actors"
  | "compare"
  | "seo"
  | "calculator"
  | "blog"
  | "changelog"
  | "docs"
  | "about"
  | "contact"
  | "faq"
  | "status"
  | "legal";

type PageMetadata = {
  title: string;
  description: string;
  path: string;
  image?: SocialImage;
  coverImage?: string | null;
  type?: "website" | "article";
  publishedTime?: string;
  tags?: string[];
  author?: string | null;
  noIndex?: boolean;
};

export function socialImageUrl(image: SocialImage = "home", coverImage?: string | null): string {
  const fallback = absoluteUrl(`/images/og/${image}.png`);
  if (coverImage) {
    try {
      const url = new URL(coverImage, `${SITE_URL}/`);
      if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    } catch {
      // A malformed CMS cover must not break a page's sharing metadata.
    }
  }
  return fallback;
}

export function createPageMetadata({
  title,
  description,
  path,
  image = "home",
  coverImage,
  type = "website",
  publishedTime,
  tags,
  author,
  noIndex = false,
}: PageMetadata): Metadata {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} · ${SITE_NAME}`;
  const fallback = absoluteUrl(`/images/og/${image}.png`);
  const imageUrl = socialImageUrl(image, coverImage);
  const socialImage = {
    url: imageUrl,
    alt: fullTitle,
    // CMS covers can have other dimensions and formats.
    ...(imageUrl === fallback ? { width: 1200, height: 630, type: "image/png" } : {}),
  };

  return {
    title: { absolute: fullTitle },
    description,
    alternates: { canonical: absoluteUrl(path) },
    openGraph: {
      title: fullTitle,
      description,
      url: absoluteUrl(path),
      siteName: SITE_NAME,
      locale: "en_US",
      type,
      images: [socialImage],
      ...(type === "article"
        ? { publishedTime, tags, ...(author ? { authors: [author] } : {}) }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [{ url: imageUrl, alt: socialImage.alt }],
    },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}

export const siteStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": absoluteUrl("/#organization"),
      name: SITE_NAME,
      url: SITE_URL,
      logo: absoluteUrl("/web-app-manifest-512x512.png"),
      description: SITE_DESCRIPTION,
    },
    {
      "@type": "WebSite",
      "@id": absoluteUrl("/#website"),
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": absoluteUrl("/#organization") },
    },
  ],
};

/** Escape CMS text before inserting JSON-LD into an HTML script element. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
