export function calculatePricing(input: {
  pricePerThousand: number;
  results: number;
  platformCost: number;
  externalCost: number;
}) {
  const revenue = (input.pricePerThousand * input.results) / 1000;
  const costs = input.platformCost + input.externalCost;
  return {
    revenue,
    costs,
    profit: revenue - costs,
    margin: revenue > 0 ? ((revenue - costs) / revenue) * 100 : null,
    breakEvenPerThousand: input.results > 0 ? (costs / input.results) * 1000 : null,
  };
}

export function auditActorSeo(input: {
  title: string;
  description: string;
  readme?: string;
  seoTitle?: string;
  seoDescription?: string;
}) {
  const title = input.seoTitle?.trim() || input.title.trim();
  const description = input.seoDescription?.trim() || input.description.trim();
  const checks = [
    {
      label: "Search title",
      passed: title.length >= 20 && title.length <= 60,
      detail: `${title.length} characters; aim for 20–60.`,
      value: title,
    },
    {
      label: "Search description",
      passed: description.length >= 80 && description.length <= 160,
      detail: `${description.length} characters; aim for 80–160.`,
      value: description,
    },
    {
      label: "Clear description",
      passed: input.description.trim().length >= 80,
      detail: "Explain the data returned and a concrete use case.",
      value: input.description,
    },
    {
      label: "Usage documentation",
      passed: input.readme === undefined ? null : input.readme.length >= 300,
      detail:
        input.readme === undefined
          ? "The public source did not return README content. Review documentation on the Actor page."
          : "Include setup instructions and an example output.",
      value: "",
    },
    {
      label: "Structured documentation",
      passed: input.readme === undefined ? null : /^#{1,3}\s+.+/m.test(input.readme),
      detail:
        input.readme === undefined
          ? "README content is unavailable from this source; this check was not scored."
          : "Use headings to make the README easy to scan.",
      value: "",
    },
  ];
  return {
    title,
    description,
    score: Math.round(
      (checks.filter((check) => check.passed === true).length /
        checks.filter((check) => check.passed !== null).length) *
        100,
    ),
    assessedChecks: checks.filter((check) => check.passed !== null).length,
    checks,
    disclaimer:
      "Editorial checks, not an Apify ranking prediction. Character ranges are guidelines; rendered width varies.",
  };
}

export function csvCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}
