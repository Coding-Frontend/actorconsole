import { PLAN_ACTOR_LIMITS, PLAN_MONTHLY_USER_LIMITS } from "@actorconsole/shared/plans";
import { MCP_TOOL_NAMES } from "@actorconsole/shared/mcp";

export interface DocLink {
  label: string;
  href: string;
}

export interface DocSection {
  id: string;
  title: string;
  paragraphs?: string[];
  steps?: string[];
  items?: string[];
  reference?: "extension";
  code?: string;
  codeLabel?: string;
  collapsed?: boolean;
}

export interface DocGuide {
  id: string;
  title: string;
  group: string;
  summary: string;
  steps?: string[];
  note?: string;
  sections?: DocSection[];
  links: DocLink[];
  reference?: "mcp" | "extension";
  keywords?: string[];
}

/** One catalog drives articles, navigation, metadata, search, and sitemap URLs. */
export const DOC_GUIDES: DocGuide[] = [
  {
    id: "getting-started",
    title: "Start with ActorConsole",
    group: "Start here",
    summary:
      "Connect your Apify account, understand your Actors, and review changes before applying them. Each workspace keeps its Actors, connections, and schedules together.",
    steps: [
      "Create your account and finish the first workspace setup.",
      "Connect an Apify API key and check that your Actors appear.",
      "Choose your next task: research the Store, improve a listing, or create a publishing schedule.",
    ],
    links: [
      { label: "Set up your first workspace", href: "/docs/first-workspace" },
      { label: "Explore the dashboard", href: "/docs/dashboard-tour" },
      { label: "Connect an AI client", href: "/docs/mcp-quickstart" },
    ],
  },
  {
    id: "first-workspace",
    title: "Set up your first workspace",
    group: "Start here",
    summary:
      "Use one workspace for the Apify account or organization you want to manage. Confirm the selected workspace before connecting credentials or changing an Actor.",
    steps: [
      "Finish onboarding after signing up. For another workspace, open the top-bar switcher and choose Create another workspace, then enter a name.",
      "Open Apify connection and save an API key for the account or organization that owns your Actors.",
      "Allow the initial sync to finish, then open Actors and check the owner and portfolio. Repair the connection and retry synchronization if the list is empty.",
      "Add a Console browser session when you need account costs and creator revenue.",
    ],
    note: "Connections are saved separately for each workspace. An existing MCP credential stays bound to the workspace that issued it.",
    links: [
      { label: "Open Apify connection", href: "/dashboard/apify" },
      { label: "Connection instructions", href: "/docs/apify-connection" },
      { label: "Open your Actors", href: "/dashboard/actors" },
    ],
  },
  {
    id: "dashboard-tour",
    title: "Find your way around",
    group: "Start here",
    summary:
      "The top-bar switcher selects the workspace. The sidebar groups the tools by the job you want to do.",
    sections: [
      {
        id: "workspace",
        title: "Manage your portfolio",
        items: [
          "Overview shows the workspace pulse; Actors opens your portfolio and improvement actions.",
          "Research finds Store opportunities, compares Actors, and saves competitors to your watchlist.",
        ],
      },
      {
        id: "operations",
        title: "Follow your work",
        items: [
          "Publishing manages status changes and schedules. Activity and run history show what happened.",
          "Usage, Costs, Revenue, and Profitability explain performance and finances.",
        ],
      },
    ],
    links: [
      { label: "Open the dashboard", href: "/dashboard" },
      { label: "Research guide", href: "/docs/research" },
      { label: "Account and help", href: "/docs/account-notifications" },
    ],
  },
  {
    id: "plans-and-limits",
    title: "Plans and workspace limits",
    group: "Start here",
    summary: `Free includes listing improvements, publishing, analytics, and MCP for workspaces with up to ${PLAN_ACTOR_LIMITS.FREE} Actors and ${PLAN_MONTHLY_USER_LIMITS.FREE} monthly users across their Actors. Pro removes these two ceilings.`,
    sections: [
      {
        id: "usage",
        title: "When a workspace exceeds a limit",
        paragraphs: [
          "Operational pages and actions require an upgrade. Research, connection setup, MCP access, billing, support, and account settings remain available; an MCP operation can still be denied by the workspace limit.",
          "Monthly users are added across Actors from available Apify usage metrics. The same person using multiple Actors may count more than once. Missing usage is shown as incomplete.",
        ],
      },
    ],
    note: "Free remains eligible at exactly 50 Actors and 500 monthly users. Limits and billing belong to the selected workspace.",
    links: [
      { label: "Review pricing", href: "/pricing" },
      { label: "Manage workspace billing", href: "/dashboard/billing" },
    ],
  },
  {
    id: "apify-connection",
    title: "Connect the Apify API",
    group: "Your Actors",
    summary:
      "Connect your Apify account to an ActorConsole workspace to load Actors, run builds and workflows, and publish changes. You need an ActorConsole account and access to the Apify account that owns your Actors.",
    steps: [
      "Sign in to ActorConsole and select the target workspace in the top-bar switcher. Open Developer → Apify connection.",
      "Sign in to Apify Console as the Actor owner, or switch to the organization that owns them. Open Settings → API & Integrations using the link below.",
      "Create a separate API token named ActorConsole, or copy an existing one. To edit and publish Actors, use an unscoped token; limited tokens cannot modify Actors.",
      "Paste the complete token into Apify API key and click Connect Apify. If Console access is already connected, choose Add API key first.",
      "Wait for the Actor sync result, then click Check connection now. Confirm API operations is Valid and the displayed Apify account matches. Open Actors to check your portfolio.",
    ],
    note: "API-only access is enough to start. Console access is optional for account costs, creator revenue, and Console metadata. Saved credentials are encrypted per workspace; keep tokens and cookie exports private.",
    sections: [
      {
        id: "token-permissions",
        title: "Choose the right account and token permissions",
        collapsed: true,
        paragraphs: [
          "Use an Apify API token here, not an ActorConsole API or MCP credential. Name a dedicated token ActorConsole so you can replace or revoke it independently.",
          "For an organization, create or copy the token while that organization is selected in Apify Console. Your organization role must allow the actions you want to perform.",
          "A scoped token can restrict reads and runs to selected resources, but Apify does not allow scoped tokens to create or modify Actors. Editing listings and publishing require an unscoped token. Successful validation alone does not confirm permission for every operation.",
        ],
      },
      {
        id: "browser-session",
        title: "Optional: add Console access with the Chrome extension",
        collapsed: true,
        reference: "extension",
        steps: [
          "Install ActorConsole Apify Connector using the Chrome Web Store link in this section.",
          "Open the extension sidebar, choose Sign in with ActorConsole, and select Authorize browser on the page that opens.",
          "Sign in to Apify Console in Chrome and reload it so the extension can detect your account.",
          "Choose the same ActorConsole workspace and matching Apify account in the extension sidebar. Connect and approve cookie access when prompted.",
          "Return to Apify connection and click Check connection now. Confirm Console operations is Valid as well as API operations.",
        ],
        paragraphs: [
          "If ActorConsole cannot detect the extension, refresh the connection page after installation. Console-only access does not load your Actor portfolio or enable actual Actor publication; keep your API key connected.",
        ],
      },
      {
        id: "manual-session",
        title: "Alternative: connect a Console session manually",
        collapsed: true,
        steps: [
          "In Apify connection, choose Connect Console session or Replace cookies if available. Expand Connect manually with a resume cURL or cookie export and choose Resume cURL.",
          "In the signed-in Apify Console tab, open browser DevTools → Network and reload the page. Find the request to https://console-backend.apify.com/public/authentication/resume and choose Copy as cURL.",
          "Paste the copied request into the manual connection field and save. If you cannot find the request, use Domain exports and paste exports for console.apify.com and console-backend.apify.com into their labeled fields.",
          "Run Check connection now to validate the Console session. Use the same Apify account as your API key.",
        ],
        paragraphs: [
          "The backend export must contain ApifyRT from console-backend.apify.com; unrelated requests or frontend cookies will not work. Only the supported session value is retained. Treat the copied request as a password and reconnect when the session expires.",
        ],
      },
      {
        id: "connection-troubleshooting",
        title: "Fix a failed connection or an empty Actor list",
        collapsed: true,
        items: [
          "The save button is disabled: paste the full API token without quotes. The field requires at least 20 characters. Leave the optional Console fields empty for API-only setup.",
          "API operations is Invalid or Expired: create or copy a working token in Apify Console, choose Replace API key, save, and run Check connection now. Replace only the failing credential.",
          "API operations is Valid but an action is denied: check the token scope, your organization role, and access to the affected Actor. A scoped token cannot edit or publish Actors.",
          "The account does not match: check the selected workspace and the account shown on Apify connection. API and Console credentials must refer to the same account. For a different owner, use another workspace or disconnect and reconnect deliberately.",
          "Connected but no Actors appear: wait for the initial sync result, confirm the owner in Apify Console, and clear search and readiness filters on Actors. If the initial sync failed, save the working API key again with Replace API key to retry it.",
          "Some Actors were skipped or the workspace is restricted: review the sync message and workspace plan limits. API authentication can succeed while the portfolio requires Pro.",
          "Console data is missing: validate Console operations separately. Reconnect an expired browser session; an API key alone does not provide account costs or creator revenue.",
        ],
      },
      {
        id: "manage-credentials",
        title: "Replace a key or disconnect the workspace",
        collapsed: true,
        paragraphs: [
          "To rotate a token, create or rotate it in Apify Console, then choose Replace API key in ActorConsole, paste the new value, and save. Check the connection and Actor sync before retiring the previous token. Replacing the API key keeps the Console credential unchanged.",
          "Disconnect credentials removes both saved credentials from this workspace and stops ActorConsole operations until you reconnect. It does not delete your Actors or resources in Apify. Revoke an unwanted token separately in Apify Console.",
        ],
      },
    ],
    links: [
      {
        label: "Apify API & Integrations",
        href: "https://console.apify.com/settings/integrations",
      },
      { label: "Open Apify connection", href: "/dashboard/apify" },
      { label: "Open your Actors", href: "/dashboard/actors" },
      { label: "Apify token permissions", href: "https://docs.apify.com/integrations/api" },
      { label: "Workspace plan limits", href: "/docs/plans-and-limits" },
    ],
    keywords: ["connect API", "cookie", "ApifyRT", "Chrome extension", "API token", "credentials"],
  },
  {
    id: "actors-workspace",
    title: "Find and manage Actors",
    group: "Your Actors",
    summary:
      "Actors shows the portfolio synchronized from your connected Apify account. Search by name, title, or identifier, then open an Actor to inspect it.",
    steps: [
      "Select a view, sorting option, and readiness filter to find the Actors you need.",
      "Check readiness warnings before publication. Missing descriptions, README, schemas, tagged builds, or account/profile requirements need attention.",
      "Select one or several Actors and choose Generate improvements, or open Publishing for Store status changes and schedules.",
    ],
    note: "An empty list can mean the wrong account, missing credentials, or an unfinished sync. A failed refresh may leave the last synchronized data visible.",
    links: [
      { label: "Open Actors", href: "/dashboard/actors" },
      { label: "Review improvements", href: "/docs/ai-listing-studio" },
      { label: "Publishing guide", href: "/docs/bulk-publishing" },
    ],
  },
  {
    id: "actor-detail",
    title: "Inspect an Actor",
    group: "Your Actors",
    summary:
      "Open an Actor from your portfolio to review its listing, recent runs, usage, pricing, and available actions.",
    steps: [
      "Check the Actor's owner, current listing, recent activity, and readiness before making a change.",
      "Inspect recent runs and pricing history to understand failures or past changes.",
      "Generate a proposal, review the selected fields, and confirm application when you are ready. Follow its result in improvement history.",
    ],
    note: "Approving fields writes them to Apify. Publishing an Actor changes its Store publication state; it is a separate action.",
    links: [
      { label: "Open your Actors", href: "/dashboard/actors" },
      { label: "Improvement history", href: "/dashboard/actors/improvements" },
      { label: "Understand analytics", href: "/docs/analytics-usage-costs" },
    ],
  },
  {
    id: "ai-listing-studio",
    title: "Generate and review improvements",
    group: "Your Actors",
    summary:
      "Generate title, description, or pricing proposals from your Actor's current context. Generation creates a draft; you choose which fields to apply.",
    steps: [
      "In Actors, select the Actor or group you want to improve and choose Generate improvements.",
      "Choose the requested fields and supply any useful instructions, then start generation.",
      "Open the review and compare current and proposed values. Select only the fields you want; use bulk field selection when reviewing several Actors.",
      "Choose Review selected changes, check the confirmation, and approve. Wait for application to finish and inspect each Actor's result.",
    ],
    note: "A queued or partly completed run does not mean every change succeeded. Resolve failed or outdated proposals before trying again. Store categories are assigned by Apify.",
    links: [
      { label: "Generate improvements", href: "/dashboard/actors" },
      { label: "Open improvement history", href: "/dashboard/actors/improvements" },
      { label: "Pricing guide", href: "/docs/pricing" },
    ],
    keywords: ["AI Listing Studio", "approve", "before after", "rewrite", "bulk optimization"],
  },
  {
    id: "pricing",
    title: "Choose and update pricing",
    group: "Your Actors",
    summary:
      "Use the pricing calculator to test a scenario, then review an Actor's pricing proposal before applying it to Apify.",
    steps: [
      "Enter price, expected results, and costs in the calculator. Compare revenue, profit, margin, and break-even price; export the scenario if useful.",
      "For an owned Actor, inspect current pricing and history. Generate a pricing improvement and review its proposed events and amounts.",
      "Approve the selected pricing field only after checking the billing unit. Confirm the result in the Actor's pricing history.",
    ],
    note: "Calculator outputs are estimates. Saved scenarios do not change Store prices. The managed pricing write supports pay-per-event pricing.",
    sections: [
      {
        id: "events",
        title: "Pay-per-event details",
        collapsed: true,
        paragraphs: [
          "Each event needs a name, title, and nonnegative USD price. At most one event can be primary; a one-time event is optional. Check the API or MCP reference for the exact PAY_PER_EVENT payload.",
        ],
      },
    ],
    links: [
      { label: "Open pricing calculator", href: "/tools/pricing" },
      { label: "Open Actors", href: "/dashboard/actors" },
      { label: "Pricing tool reference", href: "/docs/mcp-tools" },
    ],
    keywords: ["PAY_PER_EVENT", "eventPriceUsd", "primary", "one-time", "pricing history"],
  },
  {
    id: "research",
    title: "Research and compare the Store",
    group: "Research",
    summary:
      "Find opportunities using Actor discovery, keyword research, and public comparisons. These surfaces use a synchronized Store catalog; check the observation date before making a decision.",
    steps: [
      "Use Actor discovery to search or filter by category. Sort by users, runs, rating, earnings scenarios, or growth over the selected window.",
      "Use Keyword research to compare competing listings and inspect demand, difficulty, opportunity, and repeat-use signals.",
      "Compare Actors or builders side by side, then save useful competitors to your watchlist.",
      "Open SEO audit for a public listing to inspect its search preview and assessed checks. Export the audit when needed.",
    ],
    note: "Public earnings are low/central/high scenarios, not observed revenue or profit. Growth requires a historical baseline. Unavailable metrics and SEO checks are excluded rather than treated as zero or failure.",
    sections: [
      {
        id: "signals",
        title: "How to read research signals",
        collapsed: true,
        paragraphs: [
          "Demand and difficulty combine catalog usage, competing listings, runs, reviews, and snapshots. Workspace search counts reflect ActorConsole searches, not all Apify searches. Repeat use compares recent users with total users; it is a signal rather than a customer retention measurement.",
        ],
      },
    ],
    links: [
      { label: "Discover Actors", href: "/dashboard/research" },
      { label: "Research keywords", href: "/dashboard/keywords" },
      { label: "Compare Actors", href: "/actors/compare" },
      { label: "Explore builders", href: "/builders" },
      { label: "Run an SEO audit", href: "/tools/seo" },
    ],
    keywords: [
      "competition",
      "opportunity",
      "trend",
      "growth",
      "earnings estimates",
      "SEO",
      "ranking",
    ],
  },
  {
    id: "watchlists",
    title: "Watch Actors and keywords",
    group: "Research",
    summary:
      "Save competitors and search terms so you can return to them. Actor watches and saved keyword watches are separate lists.",
    steps: [
      "In Actor discovery, watch an Actor and open Watchlist to compare saved competitors. You can save up to 100 Actor watches.",
      "Enable or pause an Actor's alerts. Remove watches you no longer need, or export the current list.",
      "In Keyword research, save a keyword to revisit its search history and competition signals.",
    ],
    note: "Actor alerts follow changes in usage, price, rating, rank, or visibility after catalog synchronization. They appear in your inbox when product notifications are enabled; these watch alerts do not send email.",
    links: [
      { label: "Open Actor watchlist", href: "/dashboard/watchlist" },
      { label: "Open keyword research", href: "/dashboard/keywords" },
      { label: "Notification preferences", href: "/dashboard/notification-preferences" },
    ],
    keywords: ["competitor", "alerts", "saved keywords", "rank changes"],
  },
  {
    id: "bulk-publishing",
    title: "Manage Store status",
    group: "Operations",
    summary:
      "Use Publishing to change maintenance or deprecated status across selected Actors, or prepare a queue for publication.",
    steps: [
      "Filter by Actor status or readiness. The header checkbox selects the current page; Select all matching includes results across pages.",
      "Choose the maintenance or deprecated action you need, then review the selection before confirming.",
      "Inspect each Actor's result. For publication, choose Create schedule and review the queue and timing.",
    ],
    note: "Selection clears when the inventory view or workspace changes. A batch can partly fail; check individual results. Publication requires a healthy Apify API key.",
    links: [
      { label: "Open Publishing", href: "/dashboard/publishing" },
      { label: "Create a publishing schedule", href: "/docs/schedules-automation" },
      { label: "Fix blocked work", href: "/docs/troubleshooting" },
    ],
  },
  {
    id: "schedules-automation",
    title: "Schedule publication",
    group: "Operations",
    summary:
      "Publish an ordered queue of Actors over time. A schedule sets when work starts and how many Actors are attempted each day.",
    steps: [
      "Choose Create schedule in Publishing, select your Actors, and check their readiness warnings.",
      "Enter a name, daily publish limit, and start time. Check the UTC time and local preview.",
      "Leave the schedule paused while reviewing it, or explicitly choose to start it active. Confirm the selected Actors and timing.",
      "Use the schedules view to enable, pause, or run it now. Inspect run history and each Actor's outcome.",
    ],
    note: "The default is paused with five Actors per day. Apify's publication quota can stop a run; unfinished Actors remain queued. Fix a blocked Actor's readiness issue before retrying it.",
    links: [
      { label: "Create a schedule", href: "/dashboard/publishing/schedules/new" },
      { label: "Manage schedules", href: "/dashboard/publishing/schedules" },
      { label: "Understand UTC and cron", href: "/docs/cron" },
    ],
    keywords: ["automation", "queue", "daily quota", "retry", "paused", "run now"],
  },
  {
    id: "cron",
    title: "Set schedule times",
    group: "Operations",
    summary:
      "Publishing schedules use UTC. Choose a daily preset where possible and verify the local-time preview before enabling the schedule.",
    sections: [
      {
        id: "example",
        title: "A daily example",
        code: "0 2 * * *",
        codeLabel: "Every day at 02:00 UTC",
        paragraphs: [
          "The five fields are minute, hour, day of month, month, and day of week. This example starts at 02:00 UTC, or 07:30 in India.",
          "Use the custom cron option only when you need a different pattern. A more frequent pattern does not increase Apify's quota or the schedule's daily publish limit.",
        ],
      },
    ],
    note: "UTC does not change for daylight saving time. Your local start time may change if your timezone observes it.",
    links: [
      { label: "Create a schedule", href: "/dashboard/publishing/schedules/new" },
      { label: "Manage schedules", href: "/dashboard/publishing/schedules" },
    ],
    keywords: ["timezone", "IST", "time", "cronExpr", "dailyLimit"],
  },
  {
    id: "analytics-usage-costs",
    title: "Read usage costs and revenue",
    group: "Operations",
    summary:
      "Usage shows run activity. Costs shows account expenses. Revenue shows owner-reported creator earnings and Actor costs. Keep these measures separate when comparing results.",
    steps: [
      "Select the Actor and UTC date window on the appropriate page.",
      "Use the chart's Show menu to pick a metric. Hover, tap, or use the arrow keys on the chart for exact values; expand View exact values for a readable table or chart CSV.",
      "Open Advanced for custom metrics, daily/weekly/monthly grouping, running totals, lines or bars, and previous-period comparisons. Inspect Actors on a date filters the Actor table below.",
      "Check coverage and synchronization information. Connect a working Console session when account financials are missing.",
      "Use a daily breakdown to investigate a change. Open Profitability to include recorded external expenses.",
    ],
    note: "Unavailable data is not zero. Public earnings scenarios use assumptions and do not replace owner financial reports. Account usage cost is not creator revenue.",
    links: [
      { label: "Usage", href: "/dashboard/usage" },
      { label: "Costs", href: "/dashboard/costs" },
      { label: "Revenue", href: "/dashboard/revenue" },
      { label: "Profitability guide", href: "/docs/profitability" },
    ],
    keywords: ["analytics", "coverage", "daily", "financial", "expenses", "UTC"],
  },
  {
    id: "profitability",
    title: "Track profit and external costs",
    group: "Operations",
    summary:
      "Profitability combines owner revenue, platform cost, and recorded external expenses such as AI or proxy services.",
    steps: [
      "Select an Actor and UTC date window of up to 366 days. Check the matched-day coverage for revenue and platform cost.",
      "Record an external expense with its source, USD amount, and date in the expense ledger.",
      "Review profit and margin, inspect the expense ledger, and export the report or remove an incorrect expense.",
    ],
    note: "Profit and margin use revenue, Apify cost, and recorded external expenses on the same UTC days. Partial profit is a covered-day subtotal, not the profit for the full selected period. Expenses on unmatched days remain in the ledger and export. Profit is unavailable without any matching days; margin is undefined at zero revenue. An empty ledger does not establish zero external cost. Account allocations, taxes, and unrecorded expenses are excluded.",
    links: [{ label: "Open Profitability", href: "/dashboard/profitability" }],
  },
  {
    id: "account-notifications",
    title: "Manage your account and notifications",
    group: "Operations",
    summary:
      "Account settings manage your profile, workspace billing, notification preferences, and portable data export. Support tickets keep follow-up in the dashboard.",
    steps: [
      "Open Profile to update personal details, or Billing to see the selected workspace's current plan, Free limits, and Free versus Pro comparison. Choose monthly or yearly Pro billing where configured, select Upgrade to Pro, enter your billing address, and continue to checkout.",
      "Open Payment history for the selected workspace's recorded payments, including test-payment labels. Pro subscribers can update their billing address and cancel future renewals from Billing.",
      "Choose Notification preferences to control workspace events, then read alerts in Notifications.",
      "Use Data export to download your account data as JSON, or open Support to create and follow a ticket.",
    ],
    sections: [
      {
        id: "closure",
        title: "Close your account",
        collapsed: true,
        paragraphs: [
          "Export anything you need first. Account deletion suspends access and schedules removal after a 30-day grace period. Use Cancel deletion during that period if you change your mind. Your Actors on Apify are not changed; some records are retained in de-identified form.",
        ],
      },
    ],
    links: [
      { label: "Profile", href: "/dashboard/profile" },
      { label: "Billing", href: "/dashboard/billing" },
      { label: "Payment history", href: "/dashboard/billing/history" },
      { label: "Notification preferences", href: "/dashboard/notification-preferences" },
      { label: "Notifications", href: "/dashboard/notifications" },
      { label: "Data export", href: "/dashboard/data-export" },
      { label: "Account deletion", href: "/dashboard/account" },
      { label: "Support", href: "/dashboard/support" },
    ],
    keywords: ["delete", "cancel deletion", "export", "invoice", "billing", "support ticket"],
  },
  {
    id: "troubleshooting",
    title: "Fix common problems",
    group: "Operations",
    summary:
      "Start with the selected workspace, credential status, and the most recent operation result. These checks resolve most setup and missing-data problems.",
    sections: [
      {
        id: "connections",
        title: "Missing Actors or financial data",
        items: [
          "No Actors: check the workspace, account owner, API key validation, and initial sync.",
          "Missing costs or revenue: validate the Console session and check date coverage. Unavailable financials are not zero.",
        ],
      },
      {
        id: "work",
        title: "Blocked or unfinished work",
        items: [
          "Publishing blocked: inspect readiness and the per-Actor result. Repair the issue before retrying; quota stops keep pending Actors queued.",
          "Proposal still pending: inspect improvement history. Queue acceptance is not completion.",
        ],
      },
      {
        id: "access",
        title: "Access denied",
        paragraphs: [
          "401 usually means a missing, expired, or revoked credential. For 403, check capabilities, Actor allowlist, workspace limits, and feature availability. Follow retry guidance for 429 or temporary service failures.",
        ],
      },
    ],
    links: [
      { label: "Check Apify connection", href: "/dashboard/apify" },
      { label: "Improvement history", href: "/dashboard/actors/improvements" },
      { label: "Publishing history", href: "/dashboard/publishing/schedules" },
      { label: "Contact support", href: "/dashboard/support" },
    ],
    keywords: ["empty", "stale", "failed", "expired", "401", "403", "429", "503", "missing"],
  },
  {
    id: "mcp-quickstart",
    title: "Connect an MCP client",
    group: "MCP",
    summary:
      "Connect Claude Code, Cursor, Codex, or another MCP client using an ActorConsole workspace credential. Free includes MCP access; workspace limits still apply to operational requests.",
    steps: [
      "Select the workspace and open MCP access. Issue a credential with the capabilities and Actor scope your client needs, then save the secret shown once.",
      "For a local client, build the MCP server from your repository checkout and configure the client to launch its built entry point.",
      "Restart or reconnect the client. Ask it to get your workspace and available capabilities, then list your Actors to verify the connection.",
    ],
    sections: [
      {
        id: "build",
        title: "Build the local server",
        collapsed: true,
        paragraphs: [
          "Requires a repository checkout, pnpm, and Node.js 20.19 or later. Run these commands from the repository root, then use the configuration guide.",
        ],
        code: "pnpm install\npnpm --filter @actorconsole/mcp build",
        codeLabel: "From your repository checkout",
      },
    ],
    links: [
      { label: "Issue an MCP credential", href: "/dashboard/mcp" },
      { label: "Client configuration", href: "/docs/mcp-config" },
      { label: "Credential permissions", href: "/docs/mcp-credentials" },
    ],
    keywords: [
      "Claude Code",
      "Cursor",
      "Codex",
      "get_workspace",
      "get_mcp_capabilities",
      "list_actors",
    ],
  },
  {
    id: "mcp-config",
    title: "Configure your MCP client",
    group: "MCP",
    summary:
      "Launch the built MCP entry point with Node.js. Replace the example path with the absolute path to your repository and keep the workspace credential in private client settings.",
    sections: [
      {
        id: "json",
        title: "Claude Code or Cursor",
        codeLabel: "MCP server entry",
        code: '{\n  "mcpServers": {\n    "actorconsole": {\n      "command": "node",\n      "args": ["/absolute/path/actorconsole.com/apps/mcp/dist/index.js"],\n      "env": {\n        "ACTORCONSOLE_API_KEY": "al_your_workspace_credential",\n        "API_BASE_URL": "http://localhost:4000"\n      }\n    }\n  }\n}',
      },
      {
        id: "codex",
        title: "Codex",
        collapsed: true,
        codeLabel: "config.toml server entry",
        code: '[mcp_servers.actorconsole]\ncommand = "node"\nargs = ["/absolute/path/actorconsole.com/apps/mcp/dist/index.js"]\n\n[mcp_servers.actorconsole.env]\nACTORCONSOLE_API_KEY = "al_your_workspace_credential"\nAPI_BASE_URL = "http://localhost:4000"',
      },
      {
        id: "http",
        title: "Hosted server settings",
        collapsed: true,
        paragraphs: [
          "For a separately hosted server, use the complete HTTPS URL supplied by its operator, ending in /mcp, and send Authorization: Bearer with your workspace credential. The REST base URL is not the MCP transport URL.",
          "Hosting uses MCP_TRANSPORT=http and MCP_PORT (default 4100). Local client configuration uses ACTORCONSOLE_API_KEY and API_BASE_URL.",
        ],
      },
    ],
    links: [
      { label: "First connection", href: "/docs/mcp-quickstart" },
      { label: "Manage credentials", href: "/dashboard/mcp" },
    ],
    keywords: [
      "ACTORCONSOLE_API_KEY",
      "API_BASE_URL",
      "MCP_TRANSPORT",
      "MCP_PORT",
      "stdio",
      "HTTP",
      "Bearer",
    ],
  },
  {
    id: "mcp-credentials",
    title: "Manage MCP credentials",
    group: "MCP",
    summary:
      "Issue a separate credential for each client. Its workspace, capabilities, Actor allowlist, and expiry determine what it can do.",
    steps: [
      "In MCP access, choose a name, permissions, expiry, and all tracked Actors or a specific allowlist. Copy the raw secret when it is shown.",
      "Review last use and status. Edit permissions or Actor scope when the client's job changes, and revoke credentials you no longer need.",
      "Rotate an exposed credential, then immediately update the client. Rotate invalidates the old secret as soon as it succeeds.",
    ],
    note: "For a planned change with overlap, issue a separate credential, update and verify clients, then revoke the original. Never commit a credential or substitute an Apify token.",
    links: [
      { label: "Open MCP access", href: "/dashboard/mcp" },
      { label: "Available capabilities and tools", href: "/docs/mcp-tools" },
      { label: "Authentication guide", href: "/docs/mcp-auth" },
    ],
    keywords: ["rotate", "revoke", "expiry", "allowlist", "secret", "al_"],
  },
  {
    id: "mcp-tools",
    title: "Use MCP tools",
    group: "MCP",
    summary:
      "Start with a read, generate a proposal, and apply only the changes you approve. The server reports which tools your credential can use.",
    steps: [
      "Call get_workspace and get_mcp_capabilities to confirm the workspace and permissions.",
      "Use list_actors to find the Actor, then inspect its current context before generating changes.",
      "Review the proposal before apply_actor_changes. Supply an idempotency key and follow the returned operation status until it finishes.",
    ],
    note: "Publishing tools use internal ActorConsole IDs from list_actors. Most single-Actor reads use apifyActorId. Restricted credentials cannot access work outside their Actor allowlist.",
    reference: "mcp",
    links: [
      { label: "Manage capabilities", href: "/dashboard/mcp" },
      { label: "Publication workflow", href: "/docs/schedules-automation" },
      { label: "Errors and retries", href: "/docs/api-errors" },
    ],
    keywords: [...MCP_TOOL_NAMES, "PAY_PER_EVENT", "idempotency", "resources", "prompts"],
  },
  {
    id: "mcp-auth",
    title: "Authenticate MCP requests",
    group: "MCP",
    summary:
      "MCP uses a workspace credential beginning with al_. Apify provider credentials remain in ActorConsole; do not put them in your AI client.",
    sections: [
      {
        id: "transport",
        title: "Choose the matching transport",
        items: [
          "Local stdio: set ACTORCONSOLE_API_KEY and API_BASE_URL in the server's client configuration.",
          "Hosted HTTP: send Authorization: Bearer with the workspace credential on each request to your operator's MCP URL.",
        ],
      },
    ],
    note: "Switching the browser workspace does not change a credential's scope. For 401 check expiry or revocation; for 403 check capabilities, Actor scope, and workspace restrictions.",
    links: [
      { label: "Client configuration", href: "/docs/mcp-config" },
      { label: "Credential lifecycle", href: "/docs/mcp-credentials" },
    ],
  },
  {
    id: "api-auth",
    title: "REST API authentication",
    group: "API reference",
    summary:
      "The MCP bridge calls the REST API with a workspace Bearer credential. Interactive dashboard requests use your signed-in session. Check the operation's authentication and capabilities before integrating.",
    sections: [
      {
        id: "credentials",
        title: "Use the right credential",
        items: [
          "Workspace credential (al_): bound to one workspace, selected capabilities, and optional Actor allowlist. Accepted by supported Actor, research, publishing, and MCP routes.",
          "Interactive session: required for account and credential administration. The dashboard selects its workspace through its session context.",
        ],
        code: "Authorization: Bearer al_your_workspace_credential",
        codeLabel: "Workspace request header",
      },
    ],
    note: "A key cannot switch workspaces using a header or browser cookie. Some schema operations require an interactive session; a Bearer key does not grant account administration.",
    links: [
      { label: "Issue a workspace credential", href: "/dashboard/mcp" },
      { label: "Endpoint reference", href: "/docs/api-endpoints" },
    ],
    keywords: ["Bearer", "session", "x-business-profile-id", "permissions", "scope", "API key"],
  },
  {
    id: "api-endpoints",
    title: "REST API reference",
    group: "API reference",
    summary:
      "The API base URL is http://localhost:4000. Open the endpoint reference for method, parameters, request fields, and response descriptions.",
    sections: [
      {
        id: "first-read",
        title: "Verify a workspace read",
        code: 'curl "http://localhost:4000/actors?page=1&limit=25" \\\n  -H "Authorization: Bearer al_your_workspace_credential"',
        codeLabel: "Requires actors:read",
        paragraphs: [
          "Check ok before reading data. Keep the internal id and apifyActorId separate; use the identifier requested by the operation.",
        ],
      },
      {
        id: "mutations",
        title: "Before a write",
        paragraphs: [
          "Check the required capability, request fields, and idempotency requirements. Queue acceptance is not completion; inspect the returned operation or run status before assuming success.",
        ],
      },
    ],
    links: [
      { label: "Open endpoint reference", href: "/api/docs" },
      { label: "Download OpenAPI JSON", href: "/api/openapi.json" },
      { label: "Authentication", href: "/docs/api-auth" },
      { label: "Errors and retries", href: "/docs/api-errors" },
    ],
    keywords: [
      "endpoint",
      "pagination",
      "schema",
      "curl",
      "idempotency",
      "apifyActorId",
      "OpenAPI",
      "Swagger",
    ],
  },
  {
    id: "api-errors",
    title: "Errors and asynchronous results",
    group: "API reference",
    summary:
      "Check the response envelope before reading the payload. A successful queue response means accepted work; its run or operation status supplies the eventual result.",
    sections: [
      {
        id: "envelope",
        title: "Response format",
        code: '{ "ok": true, "data": { "items": [] } }\n\n{ "ok": false, "error": {\n  "code": "unauthenticated", "message": "Missing session"\n} }',
        codeLabel: "Success and error envelopes",
      },
      {
        id: "recover",
        title: "Choose the next action",
        items: [
          "400: correct the input. 401: repair the credential. 403: check permissions, Actor scope, or workspace limits.",
          "404: check the resource and workspace. 409: resolve the prerequisite, active run, outdated proposal, or idempotency conflict.",
          "429 or 503: follow retry guidance and back off. Repeat writes only with the operation's supported idempotency behavior.",
        ],
      },
    ],
    note: "Use the same idempotency key only to replay the same operation and payload. A new intended change needs a new key.",
    links: [
      { label: "Endpoint reference", href: "/docs/api-endpoints" },
      { label: "Rate limits", href: "/docs/api-rate-limits" },
      { label: "Troubleshooting", href: "/docs/troubleshooting" },
    ],
  },
  {
    id: "api-rate-limits",
    title: "Rate limits and quotas",
    group: "API reference",
    summary:
      "ActorConsole limits requests by operation. Apify publication quotas and provider limits are separate and can stop work even when your request is accepted.",
    steps: [
      "On 429, honor Retry-After when present and back off. Do not assume every endpoint emits rate-limit headers.",
      "For publishing, inspect the run's stop reason. A quota stop keeps unfinished Actors queued for a later run.",
    ],
    sections: [
      {
        id: "limits",
        title: "Request limit reference",
        collapsed: true,
        items: [
          "Actor synchronization: 5 requests per minute per user.",
          "MCP credential creation and rotation: each limited to 10 per hour per user and workspace.",
          "MCP: 120 requests per minute per key and 300 per workspace. Per key and tool: 60 reads, 20 mutations, or 5 manual schedule runs per minute.",
        ],
        paragraphs: [
          "Provider paths have their own limits. Workspace plan ceilings describe portfolio eligibility, not a request-per-minute allowance.",
        ],
      },
    ],
    links: [
      { label: "Workspace plan limits", href: "/docs/plans-and-limits" },
      { label: "Errors and retries", href: "/docs/api-errors" },
    ],
    keywords: ["429", "Retry-After", "quota", "throttle", "503"],
  },
];

export const DOC_GROUPS = Array.from(new Set(DOC_GUIDES.map((guide) => guide.group))).map(
  (label) => ({ label, items: DOC_GUIDES.filter((guide) => guide.group === label) }),
);

export function findDocGuide(id: string): DocGuide | undefined {
  return DOC_GUIDES.find((guide) => guide.id === id);
}

export function searchDocGuides(query: string): DocGuide[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return DOC_GUIDES.filter((guide) => {
    const text = [
      guide.title,
      guide.summary,
      guide.note,
      ...(guide.steps ?? []),
      ...(guide.keywords ?? []),
      ...guide.links.map((link) => link.label),
      ...(guide.sections ?? []).flatMap((section) => [
        section.title,
        section.code,
        ...(section.paragraphs ?? []),
        ...(section.steps ?? []),
        ...(section.items ?? []),
      ]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
