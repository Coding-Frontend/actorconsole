#!/usr/bin/env tsx
/**
 * Idempotent policy/content seeder. Run explicitly after `prisma migrate deploy`
 * in production, or through the Prisma seed hook during local development.
 * Creates draft policy templates at version 1.0.0 if they do not exist yet.
 *
 * Admins can replace this content with the real legal copy via the admin panel
 * (draft → publish). Re-running the seed never overwrites an existing row.
 */

import {
  PrismaClient,
  PolicySlug,
  PolicyStatus,
  BlogPostStatus,
  ChangelogEntryType,
  Plan,
} from "@prisma/client";
import { PLAN_MARKETING_FEATURES } from "../packages/shared/src/plans.ts";

const prisma = new PrismaClient();
const operatorName = process.env.LEGAL_OPERATOR_NAME || "Your organization";
const legalEmail = process.env.LEGAL_CONTACT_EMAIL || process.env.SUPPORT_EMAIL || "support@example.com";
const jurisdiction = process.env.LEGAL_JURISDICTION || "Your jurisdiction";
const policyTopics: Array<{ slug: PolicySlug; title: string; review: string }> = [
  { slug: "TERMS", title: "Terms of Service", review: "Describe account rules, service scope, billing, liability and dispute resolution." },
  { slug: "PRIVACY", title: "Privacy Policy", review: "Describe collected data, purposes, processors, retention, deletion and user rights." },
  { slug: "COOKIES", title: "Cookie Policy", review: "List required session cookies and any optional analytics with consent controls." },
  { slug: "REFUND", title: "Refund Policy", review: "Specify your payment, cancellation and refund terms and customer contact process." },
  { slug: "AUP", title: "Acceptable Use Policy", review: "Define acceptable hosted-service use without restricting rights granted by the MIT source license." },
  { slug: "DPA", title: "Data Processing Agreement", review: "Describe controller/processor duties, subprocessors, transfers and incident handling for your deployment." },
];
const SEED_POLICIES = policyTopics.map(({ slug, title, review }) => ({
  slug,
  title,
  body: `**Draft template: review and customize before publishing.**

Operator: ${operatorName}
Contact: ${legalEmail}
Jurisdiction: ${jurisdiction}

${review}

This draft does not describe an existing operator's practices or create a published service policy.`,
}));

async function seedBlog() {
  let author = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
  });
  if (!author) {
    author = await prisma.user.findFirst({
      where: { role: "ADMIN" },
    });
  }
  if (!author) {
    author = await prisma.user.create({
      data: {
        email: "editor@example.com",
        name: "ActorConsole Editor",
        role: "ADMIN",
      },
    });
  }

  const blogPosts = [
    {
      slug: "optimizing-apify-actor-listings-for-store-seo",
      title: "Optimizing Apify Actor Listings for Store SEO",
      excerpt:
        "Use transparent Store search signals, clearer copy, and reviewable listing changes to make an Apify actor easier to understand.",
      content: `### Getting Found on the Apify Store

To get your Apify actors discovered by users, you need to understand how the Apify Store searches and ranks actors.

#### 1. Keyword Optimization
Identify the exact search terms your customers use. Rather than naming your actor something generic like "My Scraper", name it "Google Maps Reviews Scraper" or "Instagram Email Extractor". Place these target keywords in:
- The actor title
- The short summary description
- The first heading of your README

#### 2. Repeat-Use Factor
Apify ranks actors that users run repeatedly higher. Keep your run success rates high and pricing plans predictable to encourage weekly and daily repeat runs.

#### 3. Structured READMEs
Make your input parameters extremely clear. Provide copy-pasteable JSON examples of inputs and typical outputs. Clear docs decrease customer support queries and increase retention.`,
      tags: ["SEO", "Marketing", "Guides"],
      status: BlogPostStatus.PUBLISHED,
      publishedAt: new Date(),
    },
    {
      slug: "introducing-mcp-server-for-ai-devops",
      title: "Introducing the ActorConsole MCP Server for AI DevOps",
      excerpt:
        "Connect a coding agent to the authenticated ActorConsole API and keep Apify and AI credentials on the server side.",
      content: `### A safe operating surface for AI agents

The ActorConsole Model Context Protocol (MCP) server gives Claude Code, Cursor, Codex, or another compatible client a narrow, authenticated interface for tracked Apify actors. The same API permissions and audit trail apply whether an action comes from the dashboard or an agent.

#### Configuration
The package is publish-ready but currently runs from this repository. Start it locally with:
\`\`\`bash
pnpm --filter @actorconsole/mcp dev
\`\`\`

Configure \`ACTORCONSOLE_API_KEY\` with a Pro personal API key and set \`API_BASE_URL\` to the ActorConsole API origin. The Apify token and AI-provider credentials remain inside ActorConsole; they are not copied into the MCP client.

#### What an agent can do
The supported surface includes listing and inspecting tracked actors, generating reviewable copy, schema, and README suggestions, searching Store competitors, reading or updating pricing, creating dry-run-first schedules, and reading synchronized usage costs. Apify manages Store categories automatically. Publishing remains an explicit API action.`,
      tags: ["MCP", "AI", "Automation"],
      status: BlogPostStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  ];

  let created = 0;
  for (const post of blogPosts) {
    const existing = await prisma.blogPost.findUnique({
      where: { slug: post.slug },
    });
    if (existing) continue;

    await prisma.blogPost.create({
      data: {
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        tags: post.tags,
        status: post.status,
        publishedAt: post.publishedAt,
        authorId: author.id,
        readingMinutes: 3,
      },
    });
    created++;
  }
  console.log(`  seeded ${created} blog posts`);
}

async function seedFaq() {
  const faqItems = [
    {
      question: "What is ActorConsole?",
      answer:
        "ActorConsole is an operations workspace for Apify Actor builders. It combines owned-actor synchronization, Store research, reviewable listing changes, schedules, publishing, and synchronized Apify usage-cost reporting.",
      category: "general",
      order: 0,
    },
    {
      question: "How does the free tier work?",
      answer:
        "Free includes Store research, usage reporting, AI, pricing management, publishing, and MCP for up to 50 tracked actors and 500 monthly users across your workspace actors. Upgrade to Pro when either threshold is exceeded.",
      category: "billing",
      order: 1,
    },
    {
      question: "What is the Model Context Protocol (MCP)?",
      answer:
        "MCP is an open standard that allows developer tools and IDEs such as Claude Code, Cursor, and Codex to call external APIs. The ActorConsole MCP server uses a personal ActorConsole API key to expose supported actor, research, pricing, schedule, and usage tools; Apify and AI credentials stay on the ActorConsole side.",
      category: "mcp",
      order: 2,
    },
    {
      question: "Can I switch plans at any time?",
      answer:
        "Use Dashboard → Settings → Billing to manage an available plan. The exact activation, renewal, and cancellation timing is shown by the configured payment gateway before you confirm a change.",
      category: "pricing",
      order: 0,
    },
    {
      question: "What happens when I cancel?",
      answer:
        "Your subscription stays active until the end of the current billing period. After that, your account downgrades to the Free plan. Your data is preserved.",
      category: "pricing",
      order: 1,
    },
    {
      question: "Do you offer refunds?",
      answer:
        "We refund accidental charges and billing errors within 14 days. See our Refund Policy for full details.",
      category: "pricing",
      order: 2,
    },
    {
      question: "Is there a free trial for Pro?",
      answer:
        "The Free plan includes every workflow for up to 50 actors and 500 monthly users across those actors. Upgrade to Pro when either threshold is exceeded.",
      category: "pricing",
      order: 3,
    },
    {
      question: "What does Pro unlock?",
      answer:
        "Pro removes the tracked-actor ceiling and adds AI-assisted copy and README workflows, live pricing recommendations and management, schedules, deployments, authenticated API access, MCP access, and synchronized usage-cost analytics.",
      category: "pricing",
      order: 4,
    },
  ];

  let created = 0;
  for (const item of faqItems) {
    const existing = await prisma.faqItem.findFirst({
      where: { question: item.question },
    });
    if (existing) continue;

    await prisma.faqItem.create({
      data: {
        question: item.question,
        answer: item.answer,
        category: item.category,
        order: item.order,
        published: true,
      },
    });
    created++;
  }
  console.log(`  seeded ${created} FAQ items`);
}

async function seedChangelog() {
  const changelogEntries = [
    {
      version: "v1.1.0",
      releaseDate: new Date(),
      versionSummary: "Custom branding and interactive sidebar documentation page.",
      type: ChangelogEntryType.UI,
      text: "We deployed the custom geometric ActorConsole brand logo across all templates, upgraded social authentication buttons with native brand vector icons, and completely redesigned the documentation center into a sidebar layout featuring responsive mobile drop-downs and hash-link URL syncing.",
      sortOrder: 0,
    },
    {
      version: "v1.0.0",
      releaseDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      versionSummary: "Initial release of ActorConsole DevOps platform.",
      type: ChangelogEntryType.FEATURE,
      text: "First stable release of the ActorConsole platform, supporting multi-actor performance tracking, automated cron publication schedules, and Apify keyword competition research tools.",
      sortOrder: 1,
    },
  ];

  let created = 0;
  for (const entry of changelogEntries) {
    const existing = await prisma.changelogEntry.findFirst({
      where: { version: entry.version },
    });
    if (existing) continue;

    await prisma.changelogEntry.create({
      data: {
        version: entry.version,
        releaseDate: entry.releaseDate,
        versionSummary: entry.versionSummary,
        type: entry.type,
        text: entry.text,
        sortOrder: entry.sortOrder,
        isPublished: true,
        publishedAt: new Date(),
      },
    });
    created++;
  }
  console.log(`  seeded ${created} changelog entries`);
}

async function seedPlanMarketingFeatures() {
  let created = 0;
  for (const [plan, labels] of Object.entries(PLAN_MARKETING_FEATURES) as Array<
    [Plan, readonly string[]]
  >) {
    const initialized = await prisma.planMarketingFeatureConfig.findUnique({ where: { plan } });
    if (initialized) continue;

    // Never re-add defaults after an administrator has customized a plan.
    // Existing rows may have been created before the configuration marker was
    // introduced, so preserve them while initializing the marker table.
    const existing = await prisma.planMarketingFeature.count({ where: { plan } });
    await prisma.$transaction(async (tx) => {
      await tx.planMarketingFeatureConfig.create({ data: { plan, managed: false } });
      if (existing === 0) {
        await tx.planMarketingFeature.createMany({
          data: labels.map((label, sortOrder) => ({
            plan,
            label,
            sortOrder,
            enabled: true,
          })),
        });
      }
    });
    created += existing === 0 ? labels.length : 0;
  }
  console.log(`  seeded ${created} plan marketing features`);
}

async function main() {
  let created = 0;
  let skipped = 0;
  for (const p of SEED_POLICIES) {
    const existing = await prisma.policy.findUnique({
      where: { slug_version: { slug: p.slug, version: "1.0.0" } },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.policy.create({
      data: {
        slug: p.slug,
        version: "1.0.0",
        title: p.title,
        body: p.body,
        status: PolicyStatus.DRAFT,
      },
    });
    created++;
    console.log(`  seeded ${p.slug} v1.0.0`);
  }
  console.log(`Policy seed complete. Created: ${created}, Skipped: ${skipped}.`);
  await seedPlanMarketingFeatures();

  // Content fixtures are useful for local UI development, but fabricated
  // public content must never be inserted into a production database.
  if (process.env.NODE_ENV !== "production") {
    console.log("Seeding development FAQ fixtures...");
    await seedFaq();
    console.log("Seeding development blog fixtures...");
    await seedBlog();
    console.log("Seeding development changelog fixtures...");
    await seedChangelog();
  }
}

main()
  .catch((err) => {
    console.error("Policy seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
