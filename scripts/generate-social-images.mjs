// Run from the repository root: node scripts/generate-social-images.mjs
// Uses local brand assets and fonts; no network requests or runtime image service.
import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "apps/web/public/images/og");
const assets = resolve(root, "apps/web");
const dataUrl = async (path, mime) =>
  `data:${mime};base64,${(await readFile(resolve(assets, path))).toString("base64")}`;
const [display, sans, mono, logo] = await Promise.all([
  dataUrl("src/fonts/bricolage-grotesque-latin-variable.woff2", "font/woff2"),
  dataUrl("src/fonts/ibm-plex-sans-latin-variable.woff2", "font/woff2"),
  dataUrl("src/fonts/ibm-plex-mono-latin-400.woff2", "font/woff2"),
  dataUrl("public/web-app-manifest-512x512.png", "image/png"),
]);

const cards = [
  [
    "home",
    "The workspace for\nApify Actor builders.",
    "Research the Store. Improve your listings.\nPublish with a plan. Know your costs.",
    "OPERATIONS STUDIO",
  ],
  [
    "features",
    "Your Actor portfolio.\nOne control surface.",
    "Store research, listing review, publishing,\nand financial insight in one workspace.",
    "FEATURES",
  ],
  [
    "pricing",
    "Start free.\nGrow your portfolio.",
    "Explore Free and Pro plans built for\nyour next stage as an Apify builder.",
    "PRICING & PLANS",
  ],
  [
    "customers",
    "Built for builders.\nReady for teams.",
    "Practical workflows for independent developers,\nActor studios, and engineering teams.",
    "WHO IT IS FOR",
  ],
  [
    "research",
    "Find your next\nActor opportunity.",
    "Explore Store demand, compare usage trends,\nand follow the Actors that matter.",
    "STORE RESEARCH",
  ],
  [
    "builders",
    "Meet the builders.\nExplore their work.",
    "Public Apify portfolios, usage trends,\nand estimated creator earnings.",
    "BUILDER LEADERBOARD",
  ],
  [
    "actors",
    "A closer look\nat every Actor.",
    "Explore public Actor details, pricing,\ndocumentation, and usage trends.",
    "ACTOR EXPLORER",
  ],
  [
    "compare",
    "Compare the details.\nSee the difference.",
    "Apify Actors and builders, side by side.\nPut public data in context.",
    "SIDE-BY-SIDE COMPARISON",
  ],
  [
    "seo",
    "Make your listing\neasier to find.",
    "Audit Actor search metadata, listing clarity,\nand documentation before you publish.",
    "ACTOR SEO AUDIT",
  ],
  [
    "calculator",
    "Price with your\ncosts in view.",
    "Model per-result pricing, break-even points,\nand profit margins for your next Actor.",
    "PRICING CALCULATOR",
  ],
  [
    "blog",
    "Field notes for\nActor builders.",
    "Practical guides, workflow ideas,\nand news from the ActorConsole team.",
    "THE ACTORCONSOLE BLOG",
  ],
  [
    "changelog",
    "See what shipped.\nFollow what changed.",
    "New features, fixes, and improvements\nacross ActorConsole.",
    "PRODUCT CHANGELOG",
  ],
  [
    "docs",
    "From first setup\nto daily workflow.",
    "Connect Apify, explore the Store,\nand put your Actor workspace to work.",
    "DOCUMENTATION",
  ],
  [
    "about",
    "A workspace built\naround your Actors.",
    "Meet ActorConsole: operations tooling\nfor Apify Actor builders.",
    "ABOUT ACTORCONSOLE",
  ],
  [
    "contact",
    "Let’s talk\nActorConsole.",
    "Product support, partnerships,\nand help with your workspace.",
    "CONTACT & SUPPORT",
  ],
  [
    "faq",
    "Good questions.\nClear answers.",
    "Accounts, Apify connections, publishing,\npricing, and your everyday workflow.",
    "FREQUENTLY ASKED QUESTIONS",
  ],
  [
    "status",
    "Service status,\nat a glance.",
    "Check availability, current incidents,\nand ActorConsole incident history.",
    "SYSTEM STATUS",
  ],
  [
    "legal",
    "Your data.\nYour workspace.",
    "Read our policies, privacy information,\nand terms for using ActorConsole.",
    "POLICIES & PRIVACY",
  ],
];
const escape = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  for (const [key, title, description, label] of cards) {
    await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
      @font-face{font-family:Display;src:url('${display}');font-weight:100 900}
      @font-face{font-family:Sans;src:url('${sans}');font-weight:100 900}
      @font-face{font-family:Mono;src:url('${mono}')}
      *{box-sizing:border-box}body{margin:0;background:#f6f3ed;color:#171820;font-family:Sans}
      .card{width:1200px;height:630px;padding:48px 60px;position:relative;overflow:hidden;
        background-image:linear-gradient(#d8d2c855 1px,transparent 1px),linear-gradient(90deg,#d8d2c855 1px,transparent 1px);background-size:60px 60px}
      .card:before{content:'';position:absolute;inset:24px;border:1px solid #d8d2c8;pointer-events:none}
      header{display:flex;align-items:center;gap:14px}header img{width:48px;height:48px}
      .brand{font-family:Display;font-size:30px;font-weight:700;letter-spacing:-1px}
      .edition{margin-left:auto;font:12px Mono;letter-spacing:1px;color:#5b606b}
      .label{margin-top:40px;display:flex;gap:10px;align-items:center;font:12px Mono;letter-spacing:1.5px;color:#5b606b}
      .label:before{content:'';width:8px;height:8px;background:#f86606}
      h1{font-family:Display;font-size:67px;letter-spacing:-2.8px;line-height:1.04;font-weight:650;margin:20px 0 22px;white-space:pre-line;max-width:800px}
      p{white-space:pre-line;font-size:23px;line-height:1.45;color:#5b606b;margin:0;max-width:760px}
      .diagram{position:absolute;right:60px;top:210px;width:214px;height:264px;background:#171820;color:#f6f3ed;padding:22px;border-top:4px solid #f86606}
      .diagram-title{font:11px Mono;letter-spacing:1px;color:#b6b8bf;margin-bottom:23px}
      .node{display:flex;align-items:center;gap:12px;font:12px Mono;border:1px solid #56575e;padding:13px 11px;background:#24252c}
      .dot{width:7px;height:7px;background:#f86606}.line{height:15px;border-left:1px solid #777780;margin-left:18px}
      footer{position:absolute;bottom:48px;left:60px;right:60px;border-top:1px solid #c9c4bb;padding-top:20px;display:flex;justify-content:space-between;font:12px Mono;letter-spacing:.4px}
      .footer-note{color:#5b606b}.arrow{color:#f86606;padding-left:12px}
    </style></head><body><div class="card">
      <header><img src="${logo}" alt=""><span class="brand">ActorConsole</span><span class="edition">TOOLS FOR APIFY BUILDERS</span></header>
      <div class="label">${escape(label)}</div><h1>${escape(title)}</h1><p>${escape(description)}</p>
      <aside class="diagram"><div class="diagram-title">YOUR NEXT WORKFLOW</div><div class="node"><i class="dot"></i>RESEARCH</div><div class="line"></div><div class="node"><i class="dot"></i>IMPROVE</div><div class="line"></div><div class="node"><i class="dot"></i>PUBLISH</div></aside>
      <footer><span>actorconsole.com<span class="arrow">↗</span></span><span class="footer-note">BUILT AROUND YOUR ACTORS.</span></footer>
    </div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page
      .locator("h1")
      .evaluate((heading) => heading.getBoundingClientRect().right > 926);
    if (overflow) throw new Error(`Social card title overflows: ${key}`);
    await page.screenshot({ path: resolve(output, `${key}.png`), type: "png" });
  }
} finally {
  await browser.close();
}
console.log(`Generated ${cards.length} social images at 1200×630 in ${output}`);
