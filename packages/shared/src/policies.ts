/**
 * Catalog of legal policies exposed to the web/marketing site, the admin
 * panel, and any seeders. Keep the slug values in lockstep with the
 * `PolicySlug` enum in packages/db/prisma/schema.prisma.
 */

export type PolicySlugKey = "TERMS" | "PRIVACY" | "COOKIES" | "REFUND" | "AUP" | "DPA";

export interface PolicyMeta {
  slug: PolicySlugKey;
  title: string;
  path: string; // public route under /legal/<slug-lowercase>
  shortLabel: string;
  summary: string;
}

export const POLICY_META: PolicyMeta[] = [
  {
    slug: "TERMS",
    title: "Terms of Service",
    path: "/legal/terms",
    shortLabel: "Terms",
    summary: "The rules for using ActorConsole.",
  },
  {
    slug: "PRIVACY",
    title: "Privacy Policy",
    path: "/legal/privacy",
    shortLabel: "Privacy",
    summary: "How we collect, use, and protect your data.",
  },
  {
    slug: "COOKIES",
    title: "Cookie Policy",
    path: "/legal/cookies",
    shortLabel: "Cookies",
    summary: "What cookies and trackers we use.",
  },
  {
    slug: "REFUND",
    title: "Refund Policy",
    path: "/legal/refund",
    shortLabel: "Refund",
    summary: "How subscription cancellations and refunds work.",
  },
  {
    slug: "AUP",
    title: "Acceptable Use Policy",
    path: "/legal/aup",
    shortLabel: "Acceptable Use",
    summary: "What's allowed and what isn't on ActorConsole.",
  },
  {
    slug: "DPA",
    title: "Data Processing Addendum",
    path: "/legal/dpa",
    shortLabel: "DPA",
    summary: "GDPR / data processing terms for business customers.",
  },
];

export const POLICY_SLUGS: PolicySlugKey[] = POLICY_META.map((p) => p.slug);

export const policyMetaBySlug = (slug: string): PolicyMeta | undefined =>
  POLICY_META.find((p) => p.slug === slug.toUpperCase());
