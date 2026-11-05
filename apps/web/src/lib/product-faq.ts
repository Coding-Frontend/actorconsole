export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export interface FaqGroup {
  category: string;
  items: FaqItem[];
}

// Product help maintained with the application, based on the public guides.
// This remains available when the CMS has no FAQs or is temporarily unavailable.
export const PRODUCT_FAQ_GROUPS: FaqGroup[] = [
  {
    category: "ActorConsole",
    items: [
      {
        id: "product-overview",
        category: "ActorConsole",
        question: "What is ActorConsole?",
        answer:
          "ActorConsole is an operations workspace for Apify Actor builders. It brings together Apify Store research, Actor listing improvements, publishing schedules, and usage and financial analytics. Start with the guides at /docs.",
      },
      {
        id: "product-apify",
        category: "ActorConsole",
        question: "Does ActorConsole replace Apify?",
        answer:
          "No. ActorConsole connects to your existing Apify account to help manage the work around your Actors. Your Actors run on Apify. ActorConsole is an independent product and is not affiliated with Apify Technologies.",
      },
      {
        id: "product-research",
        category: "ActorConsole",
        question: "Can I research Actors before connecting my Apify account?",
        answer:
          "Yes. You can browse public Apify Store research at /research, explore the builder leaderboard at /builders, and use the public pricing calculator and listing SEO audit. Managing your own Actors requires an account, a workspace, and an Apify connection.",
      },
    ],
  },
  {
    category: "Connections and data",
    items: [
      {
        id: "product-connection",
        category: "Connections and data",
        question: "How do I connect my Apify account?",
        answer:
          "Create a workspace, open Apify connection, and save an API key for the Apify account or organization that owns your Actors. Wait for the initial sync, then check your Actor portfolio. The connection guide at /docs/apify-connection explains the steps.",
      },
      {
        id: "product-extension",
        category: "Connections and data",
        question: "Is the Chrome extension required?",
        answer:
          "API-only access is enough to start managing Actors. A connected Apify Console browser session is optional and provides account cost and creator revenue information. The ActorConsole Apify Connector helps connect that Console session to the selected workspace.",
      },
      {
        id: "product-financials",
        category: "Connections and data",
        question: "Where do usage costs and revenue come from?",
        answer:
          "ActorConsole reads available data from your connected Apify account. Account costs and creator revenue require a Console session. The Profitability view combines available revenue and costs with external costs you record; missing data is not a guarantee of zero cost or revenue. See /docs/analytics-usage-costs and /docs/profitability.",
      },
    ],
  },
  {
    category: "Publishing and AI",
    items: [
      {
        id: "product-review",
        category: "Publishing and AI",
        question: "Are AI-generated listing changes applied automatically?",
        answer:
          "Generating a listing improvement does not apply it. Review the proposal in the AI listing studio, approve the changes you want, and apply them through the available Actor actions. Read the workflow at /docs/ai-listing-studio before changing a live listing.",
      },
      {
        id: "product-mcp",
        category: "Publishing and AI",
        question: "Can an AI assistant use ActorConsole?",
        answer:
          "Compatible AI clients can connect to the ActorConsole MCP server using a workspace credential. That credential is bound to the workspace that issued it. Apify and AI-provider credentials stay on the ActorConsole server. Follow /docs/mcp-quickstart to configure a client and keep credentials private.",
      },
    ],
  },
];

/** Published CMS answers override matching product questions without duplicates. */
export function mergeFaqGroups(published: FaqGroup[]): FaqGroup[] {
  const key = (question: string) => question.trim().toLowerCase();
  const publishedQuestions = new Set(
    published.flatMap((group) => group.items.map((item) => key(item.question))),
  );
  return [
    ...PRODUCT_FAQ_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => !publishedQuestions.has(key(item.question))),
    })),
    ...published,
  ].filter((group) => group.items.length > 0);
}
