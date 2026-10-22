"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Check, Copy, Terminal } from "lucide-react";
import { ChromeExtensionLink } from "@/components/chrome-extension-link";
import type { DocGuide, DocSection } from "@/lib/documentation";
import {
  MCP_PROMPT_NAMES,
  MCP_PROMPT_CAPABILITIES,
  MCP_PROMPT_ADDITIONAL_CAPABILITIES,
  MCP_RESOURCE_CAPABILITIES,
  MCP_RESOURCE_URIS,
  MCP_TOOL_ADDITIONAL_CAPABILITIES,
  MCP_TOOL_CAPABILITIES,
  MCP_TOOL_GROUPS,
  MCP_TOOL_INPUTS,
  MCP_TOOL_NAMES,
  MCP_TOOL_SUMMARIES,
} from "@actorconsole/shared/mcp";

export function CodeBlock({ code, label = "Run in terminal" }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="docs-code border-border bg-ink overflow-hidden rounded-md border">
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <div className="text-muted-foreground flex items-center gap-2 text-[11px] font-medium">
          <Terminal className="text-signal-orange h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </div>
        <button
          type="button"
          onClick={() => void copyCode()}
          className="focus-visible:ring-signal-orange text-muted-foreground hover:bg-accent hover:text-foreground inline-flex min-h-8 items-center gap-1.5 rounded-sm px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
          aria-label={copied ? "Code copied" : "Copy code"}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="text-foreground/80 overflow-x-auto p-4 font-mono text-xs leading-6">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function McpToolReference() {
  return (
    <div className="space-y-6">
      <p className="text-graphite text-sm leading-relaxed">
        Tool access is controlled by the credential&apos;s capabilities and Actor allowlist. Rewrite
        and optimization tools create proposals; applying or publishing remains a separate, explicit
        operation.
      </p>
      <p className="text-graphite text-sm leading-relaxed">
        The server registers {MCP_TOOL_NAMES.length} tools. Call <code>get_mcp_capabilities</code>
        to see which ones your credential can use. Inventory, usage, and revenue reads use
        synchronized data; optimization and publishing runs may continue in the background.
      </p>
      <div className="space-y-4">
        {MCP_TOOL_GROUPS.map((group) => (
          <section key={group.label} className="border-chalk overflow-hidden rounded-lg border">
            <h2 className="bg-fog text-carbon border-chalk border-b px-4 py-3 text-sm font-semibold">
              {group.label}{" "}
              <span className="text-graphite font-normal">({group.tools.length})</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="text-graphite w-full min-w-[1080px] border-collapse text-left text-xs">
                <thead className="border-chalk border-b text-[11px] uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Tool
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Capability
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Inputs
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Behavior
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-chalk divide-y">
                  {group.tools.map((name) => (
                    <tr key={name}>
                      <td className="text-carbon px-4 py-3 align-top font-mono">{name}</td>
                      <td className="px-4 py-3 align-top font-mono">
                        {[
                          MCP_TOOL_CAPABILITIES[name],
                          ...(MCP_TOOL_ADDITIONAL_CAPABILITIES[name] ?? []),
                        ]
                          .filter(Boolean)
                          .join(" + ") || "MCP credential"}
                      </td>
                      <td className="px-4 py-3 leading-5">{MCP_TOOL_INPUTS[name]}</td>
                      <td className="px-4 py-3 leading-5">{MCP_TOOL_SUMMARIES[name]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      <div className="border-chalk bg-fog space-y-2 rounded-lg border p-4 text-xs leading-5">
        <h2 className="text-carbon text-sm font-semibold">Limits and response details</h2>
        <p>
          <code>list_actors</code> returns pages of up to 500. Status-specific lists return the
          first 100 by default and accept a limit up to 500. The Actors resource exposes the first
          500; use the tool to page further.
        </p>
        <p>
          <code>get_actor_revenue</code> returns creator revenue and profit from the synchronized
          financial ledger. Its <code>limit</code> is a 1–180 day window; day/month and
          absolute/cumulative report modes are supported. <code>get_actor_performance</code> returns
          run and platform-cost data, not creator revenue.
        </p>
        <p>
          <code>get_pricing</code> reads synchronized pricing. <code>get_pricing_history</code>{" "}
          returns up to 180 recorded changes. <code>set_pricing</code> writes pay-per-event pricing
          and accepts primary and one-time event flags. <code>recommend_pricing</code> compares live
          public Store listings. Keyword searches use the synchronized public Store catalog and
          include summary metrics.
        </p>
        <p>
          For <code>set_pricing</code>, <code>pricing.model</code> must be{" "}
          <code>PAY_PER_EVENT</code>. <code>pricing.events</code> needs at least one named event.
          Each event requires a nonnegative <code>eventPriceUsd</code> and nonempty{" "}
          <code>eventTitle</code>; <code>eventDescription</code>, <code>isPrimaryEvent</code>, and{" "}
          <code>isOneTimeEvent</code> are optional. At most one event can be primary.
        </p>
        <p>
          <code>list_actors.status</code> accepts all, published, maintenance, deprecated,
          unpublished, or publish-ready. <code>readiness</code> accepts all, ready, needs-attention,
          unknown, missing-description, missing-readme, missing-input-schema, missing-output-schema,
          or missing-key-value-store-schema. <code>change_actor_store_status.action</code> accepts
          mark_maintenance, clear_maintenance, mark_deprecated, or clear_deprecated.
        </p>
        <p>
          <code>create_actor_optimization_run.kind</code> accepts GENERATE_IMPROVEMENTS,
          REWRITE_COPY, UPDATE_PRICING, or CUSTOM. Available fields are title, description, and
          pricing. Actor IDs in this tool may be ActorConsole IDs or Apify Actor IDs.
        </p>
        <p>
          Publishing tools take ActorConsole internal Actor IDs from <code>list_actors</code>{" "}
          items&apos; <code>id</code> fields. Most single-Actor read tools take{" "}
          <code>apifyActorId</code>. Publishing mutations and <code>apply_actor_changes</code>{" "}
          require idempotency keys. Schedule creation is paused by default. A restricted credential
          can include up to 100 tracked Actors.
        </p>
      </div>
      <div className="docs-grid grid gap-4 lg:grid-cols-2">
        <section className="border-chalk rounded-lg border p-4">
          <h2 className="text-carbon text-sm font-semibold">Resources</h2>
          <ul className="text-graphite mt-3 space-y-2 text-xs">
            {MCP_RESOURCE_URIS.map((uri) => (
              <li key={uri}>
                <code className="text-carbon break-all">{uri}</code>
                <span className="block">Requires {MCP_RESOURCE_CAPABILITIES[uri]}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="border-chalk rounded-lg border p-4">
          <h2 className="text-carbon text-sm font-semibold">Prompts</h2>
          <ul className="text-graphite mt-3 space-y-2 text-xs">
            {MCP_PROMPT_NAMES.map((name) => (
              <li key={name}>
                <code className="text-carbon break-all">{name}</code>
                <span className="block">
                  Requires{" "}
                  {[
                    MCP_PROMPT_CAPABILITIES[name],
                    ...(MCP_PROMPT_ADDITIONAL_CAPABILITIES[name] ?? []),
                  ].join(" + ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function SectionContent({ section }: { section: DocSection }) {
  return (
    <div className="space-y-3">
      {section.reference === "extension" ? <ChromeExtensionLink /> : null}
      {section.steps ? (
        <ol className="list-decimal space-y-3 pl-5">
          {section.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
      {section.paragraphs?.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {section.items ? (
        <ul className="list-disc space-y-2 pl-5">
          {section.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {section.code ? <CodeBlock code={section.code} label={section.codeLabel} /> : null}
    </div>
  );
}

export function DocArticle({ guide }: { guide: DocGuide }) {
  useEffect(() => {
    function revealSection() {
      const target = document.getElementById(window.location.hash.slice(1));
      if (!target) return;
      const details = target.closest("details");
      if (details) details.open = true;
      target.scrollIntoView?.({ block: "start" });
    }
    revealSection();
    window.addEventListener("hashchange", revealSection);
    return () => window.removeEventListener("hashchange", revealSection);
  }, [guide.id]);

  return (
    <article className="text-graphite space-y-6 text-sm leading-relaxed">
      <p className="text-body-lg">{guide.summary}</p>
      {guide.steps ? (
        <section id="steps" className="scroll-mt-28 space-y-3">
          <h2 className="font-display-tight text-carbon text-lg">Steps</h2>
          <ol className="list-decimal space-y-3 pl-5">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}
      {guide.reference === "extension" ? <ChromeExtensionLink /> : null}
      {guide.note ? (
        <aside className="border-chalk bg-fog rounded-md border p-4">
          <p>{guide.note}</p>
        </aside>
      ) : null}
      {guide.sections?.map((section) =>
        section.collapsed ? (
          <details
            key={section.id}
            id={section.id}
            className="border-chalk scroll-mt-28 rounded-md border p-4"
          >
            <summary className="text-carbon cursor-pointer font-semibold">{section.title}</summary>
            <div className="mt-4">
              <SectionContent section={section} />
            </div>
          </details>
        ) : (
          <section key={section.id} id={section.id} className="scroll-mt-28 space-y-3">
            <h2 className="font-display-tight text-carbon text-lg">
              <a href={`#${section.id}`} className="hover:underline">
                {section.title}
              </a>
            </h2>
            <SectionContent section={section} />
          </section>
        ),
      )}
      {guide.reference === "mcp" ? (
        <details id="tool-reference" className="border-chalk scroll-mt-28 rounded-md border p-4">
          <summary className="text-carbon cursor-pointer font-semibold">
            Full tool reference ({MCP_TOOL_NAMES.length} tools)
          </summary>
          <div className="mt-4">
            <McpToolReference />
          </div>
        </details>
      ) : null}
      <nav
        aria-label="Related pages"
        className="border-chalk flex flex-wrap gap-x-5 gap-y-3 border-t pt-5"
      >
        {guide.links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-signal-orange font-medium hover:underline"
          >
            {link.label} <span aria-hidden="true">→</span>
          </Link>
        ))}
      </nav>
    </article>
  );
}
