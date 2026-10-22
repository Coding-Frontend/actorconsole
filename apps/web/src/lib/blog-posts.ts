export interface BlogPostAuthor {
  name: string | null;
  email?: string;
}

export interface MarketingBlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content?: string;
  coverImage: string | null;
  publishedAt: string | null;
  tags: string[];
  readingMinutes: number | null;
  author: BlogPostAuthor | null;
  seoTitle?: string;
  seoDescription?: string;
}

/**
 * Editorial starter content is available in development when the CMS is empty.
 * Production pages render only published API/CMS records.
 */
export const SEEDED_BLOG_POSTS: MarketingBlogPost[] = [
  {
    id: "seed-mcp-server",
    slug: "introducing-mcp-server-for-ai-devops",
    title: "Introducing the ActorConsole MCP Server for AI DevOps",
    excerpt:
      "Connect a coding agent to the authenticated ActorConsole API while keeping Apify and AI credentials on the server side.",
    coverImage: null,
    publishedAt: "2026-08-01T09:00:00.000Z",
    tags: ["MCP", "AI", "Automation"],
    readingMinutes: 3,
    author: { name: "ActorConsole team", email: "editor@example.com" },
    content: `
## A safe operating surface for AI agents

The ActorConsole Model Context Protocol server gives compatible coding agents a narrow, authenticated interface for tracked Apify actors. The same permissions and audit trail apply whether an action comes from the dashboard or an agent.

## Keep credentials on the server

Configure the MCP client with an ActorConsole MCP credential and API origin. Apify tokens and AI-provider credentials remain inside ActorConsole, so they are never copied into the coding agent.

## Start with reviewable actions

Begin with read-heavy tools such as inspecting actors, researching Store demand, summarizing usage, and reviewing proposed changes. Add write actions only when approval and audit boundaries are clear.
`,
  },
  {
    id: "seed-store-seo",
    slug: "optimizing-apify-actor-listings-for-store-seo",
    title: "Optimizing Apify Actor Listings for Store SEO",
    excerpt:
      "Use transparent Store search signals, clearer copy, and reviewable listing changes to make an Apify actor easier to understand.",
    coverImage: null,
    publishedAt: "2026-07-30T09:00:00.000Z",
    tags: ["SEO", "Marketing", "Guides"],
    readingMinutes: 3,
    author: { name: "ActorConsole team", email: "editor@example.com" },
    content: `
## Make the outcome obvious

Use the words your customers actually search for in the actor title, short summary, and README introduction. Specific language makes the Store page easier to scan and sets a clearer expectation before the first run.

## Keep the listing evidence-backed

Pair the promise with concrete inputs, outputs, examples, and current screenshots. Search demand and competitor context can help prioritize the next improvement, but the listing should always describe what the actor really does.

## Review before publishing

Stage copy, schema, and README changes as a reviewable update. Apify manages Store categories automatically. A predictable publishing cadence keeps the listing accurate without turning every edit into a last-minute production change.
`,
  },
  {
    id: "seed-actor-operations",
    slug: "operating-system-for-apify-actor-portfolios",
    title: "The operating system for an Apify actor portfolio",
    excerpt:
      "A portfolio becomes a product when its listings, publishing schedules, and costs are managed as one system.",
    coverImage: null,
    publishedAt: "2026-07-28T09:00:00.000Z",
    tags: ["Strategy", "Operations"],
    readingMinutes: 6,
    author: { name: "ActorConsole team", email: "editor@example.com" },
    seoTitle: "The operating system for an Apify actor portfolio",
    seoDescription:
      "A practical operating model for Apify builders managing listings, publishing schedules, and usage costs.",
    content: `
## The work around the actor is the product

Writing the actor is only the visible part of the job. A durable actor business also needs a reliable Store listing, a pricing model that survives real usage, a publishing rhythm, and a clear view of platform costs.

When those decisions live in separate tabs and private notes, every change creates more coordination work. A small copy edit can become a manual release. A price change can arrive after the margin has already moved. An issue in production can be hard to connect to the commit that introduced it.

## Build one operating loop

The most useful operating loop is simple:

1. Research demand before deciding what to ship.
2. Improve the listing and pricing with evidence.
3. Review listing changes and publish on a predictable cadence.
4. Watch usage costs and feed what you learn back into the next iteration.

The point is not to add process for its own sake. It is to keep the important context close to the decision that needs it.

## A calmer way to scale

Once the loop is visible, automation becomes easier to choose. Schedule the work that benefits from consistency. Keep judgment-heavy decisions explicit. Give your team and your agents the same source of truth.

That is the difference between operating one actor and operating a portfolio.
`,
  },
  {
    id: "seed-pricing-models",
    slug: "practical-pricing-model-for-apify-actors",
    title: "A practical pay-per-event price for Apify actors",
    excerpt:
      "Set a clear event price that reflects the value of each actor action and the cost of serving it reliably.",
    coverImage: null,
    publishedAt: "2026-07-22T09:00:00.000Z",
    tags: ["Pricing", "Operations"],
    readingMinutes: 7,
    author: { name: "ActorConsole team", email: "editor@example.com" },
    content: `
## Start with the event, not the headline price

An actor price should make the value exchange legible. The customer needs to understand what one billable event represents, and you need to know what it costs to support.

Define one event in plain language: a successful scrape, a generated report, or another discrete action your actor delivers. Keep that definition stable across the Store listing, README, and dashboard.

## Price the event honestly

Write down the compute, proxy, storage, and support cost behind one paid event. Then compare the price with a realistic mix of small and large runs instead of only the average.

## Keep the event price observable

Track the event price alongside usage costs and repeat runs. A good operating surface lets you adjust the event price in a controlled way without losing the history that explains the change.
`,
  },
  {
    id: "seed-usage-costs",
    slug: "read-apify-actor-usage-costs",
    title: "How to read actor usage costs before they surprise you",
    excerpt:
      "A field guide to turning run volume, compute, proxies, and storage into a useful operating signal.",
    coverImage: null,
    publishedAt: "2026-07-15T09:00:00.000Z",
    tags: ["Analytics", "Operations"],
    readingMinutes: 5,
    author: { name: "ActorConsole team", email: "editor@example.com" },
    content: `
## A cost number needs a story

A monthly total is useful, but it is not enough to make a decision. The actionable question is what changed: more runs, longer compute, a different proxy mix, or a new storage pattern.

Group the signal by actor and by time. Look for a change in cost per result rather than only a change in total spend. A growing actor can spend more and still be healthier if the value and margin grow with it.

## Three checks for every review

1. Compare cost per successful result with the previous period.
2. Separate intentional growth from retries, timeouts, and failed runs.
3. Record the release or schedule change that explains the movement.

This turns usage data from a monthly report into a feedback loop for engineering and pricing decisions.
`,
  },
  {
    id: "seed-scheduled-publishing",
    slug: "scheduled-publishing-for-apify-store-listings",
    title: "Why scheduled publishing beats last-minute Store edits",
    excerpt:
      "Use a small release cadence to keep actor listings accurate, consistent, and easier to review.",
    coverImage: null,
    publishedAt: "2026-07-08T09:00:00.000Z",
    tags: ["Publishing", "Product"],
    readingMinutes: 5,
    author: { name: "ActorConsole team", email: "editor@example.com" },
    content: `
## Listings drift quietly

An actor can keep working while its description, screenshots, pricing, or examples fall behind. That gap costs trust before it shows up as a clear bug.

A scheduled publishing rhythm makes the work visible. Draft changes, review them against the current actor, and release them in a repeatable window. The cadence can be weekly, monthly, or event-driven; the important part is that it exists.

## Keep the human decision in the loop

Automation should prepare and stage the update. A builder should still be able to see what changed and why it is safe to publish. This gives you speed without making the Store feel unattended.

The result is a listing that behaves more like a maintained product surface than a page you remember only when a customer asks a question.
`,
  },
  {
    id: "seed-apify-source-health",
    slug: "what-apify-actor-runtime-health-should-catch",
    title: "What Apify Actor runtime health should catch",
    excerpt:
      "A healthy build is more than a successful status. Runtime signals can flag operational risks before they affect users.",
    coverImage: null,
    publishedAt: "2026-06-30T09:00:00.000Z",
    tags: ["Engineering", "Operations"],
    readingMinutes: 8,
    author: { name: "ActorConsole team", email: "editor@example.com" },
    content: `
## The hidden failure modes are operational

An Actor build can complete successfully and still contain a costly regression. Builders need to look for memory growth, unbounded concurrency, retry loops, selector drift, and changes that alter the customer-facing result shape.

## Review against the platform

The most useful questions connect code to runtime behavior:

- Does the new path increase requests without a corresponding result or cache strategy?
- Can a failed page cause the whole run to retry indefinitely?
- Will the actor remain inside its memory and timeout budget at the largest expected input?
- Does a selector change have a fixture or signal that will fail loudly?

ActorConsole runtime checks do not replace human review. They give each release a sharper first pass and keep platform-specific risks visible alongside the operational signals that matter after publishing.
`,
  },
  {
    id: "seed-mcp-handoff",
    slug: "mcp-handoff-for-apify-builder-agents",
    title: "The MCP handoff: giving your agent a safe operating surface",
    excerpt:
      "The best agent integration is not a giant prompt. It is a small, explicit set of tools with clear boundaries and useful context.",
    coverImage: null,
    publishedAt: "2026-06-21T09:00:00.000Z",
    tags: ["AI agents", "MCP"],
    readingMinutes: 6,
    author: { name: "ActorConsole team", email: "editor@example.com" },
    content: `
## Context is the interface

An agent can help with actor operations when it can see the same facts a builder uses: the actor, its listing, its schedules, its publishing state, and its usage signals. Sending a model more prose does not create that context.

An MCP server gives the agent a typed operating surface. Each tool can expose one decision-sized action, return a clear result, and make its safety boundary explicit.

## Start narrow

Begin with read-heavy tools: research demand, inspect an actor, summarize usage, and review a proposed change. Add write actions only when the approval and audit story is clear.

That approach makes the agent useful on day one while keeping the human in control of consequential changes.
`,
  },
  {
    id: "seed-keyword-demand",
    slug: "field-guide-to-actor-keyword-demand",
    title: "A field guide to actor keyword demand",
    excerpt:
      "Use search volume and competitor context to decide which listing language deserves a place on the Store page.",
    coverImage: null,
    publishedAt: "2026-06-12T09:00:00.000Z",
    tags: ["Research", "Store"],
    readingMinutes: 6,
    author: { name: "ActorConsole team", email: "editor@example.com" },
    content: `
## Demand is a positioning input

Keyword research is most useful before the copy is written. It can show how people describe the job they want done, which alternatives they already know, and where your actor can be specific.

Look for the intersection of demand and fit. A popular phrase that does not describe your actual output will create the wrong expectation. A smaller phrase with a clear outcome can bring better users.

Use the research to sharpen the title, first paragraph, examples, and screenshots together. Consistency across those surfaces is more persuasive than repeating the same keyword everywhere.
`,
  },
  {
    id: "seed-first-actor-business",
    slug: "from-first-actor-to-repeatable-actor-business",
    title: "From first actor to a repeatable actor business",
    excerpt:
      "The habits that make a second and third actor easier to build, launch, and support than the first.",
    coverImage: null,
    publishedAt: "2026-06-04T09:00:00.000Z",
    tags: ["Strategy", "Product"],
    readingMinutes: 7,
    author: { name: "ActorConsole team", email: "editor@example.com" },
    content: `
## Repeatability is a product feature

The first actor teaches you what the platform can do. The second teaches you which parts of the work should become a system.

Keep a short operating record: why the actor exists, what it costs to run, which inputs are fragile, how the listing is positioned, and what support questions keep recurring. That record becomes the template for the next release.

The goal is not to make every actor identical. It is to make the decisions around each actor easier to see, compare, and improve.
`,
  },
];

export function getSeededBlogPost(slug: string) {
  return SEEDED_BLOG_POSTS.find((post) => post.slug === slug) ?? null;
}
