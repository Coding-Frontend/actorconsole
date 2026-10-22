"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-workbench";
import { downloadCsv } from "./research-tools";
import {
  fieldClass,
  intelligenceRequest,
  PagePagination,
  useIntelligence,
  WorkspaceState,
  type IntelligenceActor,
} from "./workspace-data";

interface ProfitRow {
  id: string;
  title: string;
  actorName: string;
  revenueUsd: number | null;
  platformCostUsd: number | null;
  externalCostUsd: number;
  profitRevenueUsd: number | null;
  profitPlatformCostUsd: number | null;
  profitExternalCostUsd: number | null;
  unmatchedExternalCostUsd: number;
  unmatchedExpenses: number;
  matchedDays: number;
  coveredDates: string[];
  profitUsd: number | null;
  margin: number | null;
  revenueDays: number;
  costDays: number;
  days: number;
  complete: boolean;
  recordedExpenses: number;
}
interface Profit {
  items: ProfitRow[];
  from: string;
  to: string;
  coverage: string;
}
interface Expense {
  id: string;
  actorId: string;
  source: string;
  amountUsd: string;
  incurredAt: string;
  runId: string | null;
  actor: { title: string | null; actorName: string };
}
interface Ledger {
  items: Expense[];
  total: number;
  totalUsd: number;
  page: number;
  pageSize: number;
  coverage: string;
}
const money = (value: number | null) =>
  value == null
    ? "Unavailable"
    : value !== 0 && Math.abs(value) < 0.000001
      ? value < 0
        ? "−<$0.000001"
        : "<$0.000001"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 6,
        }).format(value);

export function Profitability() {
  const router = useRouter();
  const params = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);
  const from =
    params.get("from") ?? new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const to = params.get("to") ?? today;
  const actor = params.get("actor") ?? "";
  const page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  const query = new URLSearchParams({ from, to, ...(actor ? { actor } : {}), page: String(page) });
  const actors = useIntelligence<IntelligenceActor[]>("/actors");
  const profit = useIntelligence<Profit>(`/profitability?${query}`);
  const ledger = useIntelligence<Ledger>(`/costs?${query}`);
  const [pending, setPending] = useState<string | null>(null);
  function refresh() {
    profit.refresh();
    ledger.refresh();
  }
  async function remove(id: string) {
    setPending(id);
    try {
      await intelligenceRequest(`/costs/${id}`, "DELETE");
      refresh();
      toast.success("Expense removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove expense.");
    } finally {
      setPending(null);
    }
  }
  return (
    <div className="space-y-10">
      <DashboardPageHeader
        context="Finance"
        title="Profitability & external costs"
        description="Combine owner-reported financials with recorded AI, proxy, and other service expenses."
        primaryAction={
          <Button asChild variant="outline">
            <Link href="/dashboard/revenue">Revenue analytics</Link>
          </Button>
        }
      />
      <form
        action="/dashboard/profitability"
        className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr_auto]"
      >
        <label htmlFor="profit-from" className="space-y-2 text-sm font-medium">
          From (UTC)
          <Input id="profit-from" type="date" name="from" defaultValue={from} required />
        </label>
        <label htmlFor="profit-to" className="space-y-2 text-sm font-medium">
          To (UTC)
          <Input id="profit-to" type="date" name="to" defaultValue={to} required />
        </label>
        <label className="space-y-2 text-sm font-medium">
          Actor
          <select name="actor" defaultValue={actor} className={fieldClass}>
            <option value="">All Actors</option>
            {actors.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title ?? item.actorName}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">Apply dates</Button>
      </form>
      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Profit after recorded expenses</h2>
          <Button
            variant="outline"
            disabled={!profit.data?.items.length}
            onClick={() =>
              downloadCsv("actor-profitability.csv", [
                [
                  "Actor",
                  "Revenue USD (recorded)",
                  "Apify cost USD (recorded)",
                  "External expenses USD (recorded)",
                  "Comparable revenue USD",
                  "Comparable Apify cost USD",
                  "Comparable external expenses USD",
                  "Expenses outside comparable days USD",
                  "Profit USD (comparable days)",
                  "Margin %",
                  "Revenue days",
                  "Cost days",
                  "Selected days",
                  "Comparable days",
                  "Coverage status",
                  "Covered UTC dates",
                  "From UTC",
                  "To UTC",
                ],
                ...profit.data!.items.map((row) => [
                  row.title,
                  row.revenueUsd,
                  row.platformCostUsd,
                  row.externalCostUsd,
                  row.profitRevenueUsd,
                  row.profitPlatformCostUsd,
                  row.profitExternalCostUsd,
                  row.unmatchedExternalCostUsd,
                  row.profitUsd,
                  row.margin,
                  row.revenueDays,
                  row.costDays,
                  row.days,
                  row.matchedDays,
                  row.complete ? "Complete" : row.matchedDays ? "Partial" : "No comparable days",
                  row.coveredDates.join("; "),
                  profit.data!.from,
                  profit.data!.to,
                ]),
              ])
            }
          >
            <Download />
            Export profitability
          </Button>
        </div>
        <WorkspaceState {...profit} retry={profit.refresh} />
        {profit.data && (
          <>
            <p className="text-muted-foreground max-w-[75ch] text-sm leading-6">
              {profit.data.coverage}
            </p>
            <p className="text-muted-foreground text-sm">
              {profit.data.from} to {profit.data.to} (UTC). Table amounts use comparable days. Where
              no days match, revenue and cost show reported totals only. Export includes all
              reported totals and the dates used for each calculation.
            </p>
            {!profit.data.items.length ? (
              <p className="border-border text-muted-foreground border p-6 text-sm">
                No Actors found for this selection.{" "}
                <Link href="/dashboard/actors" className="underline underline-offset-4">
                  Import Actors
                </Link>{" "}
                or clear the Actor filter.
              </p>
            ) : (
              <div className="border-border overflow-x-auto border-y">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-muted/30 text-muted-foreground">
                    <tr>
                      {[
                        "Actor",
                        "Revenue",
                        "Apify cost (paying users)",
                        "External expenses",
                        "Profit",
                        "Margin",
                        "Coverage",
                      ].map((label) => (
                        <th key={label} scope="col" className="px-4 py-4 font-medium">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {profit.data.items.map((row) => (
                      <tr key={row.id}>
                        <th scope="row" className="max-w-[220px] px-4 py-4 text-left font-medium">
                          <Link
                            href={`/dashboard/actors/${row.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {row.title}
                          </Link>
                        </th>
                        <td className="px-4 py-4 tabular-nums">
                          {money(row.matchedDays ? row.profitRevenueUsd : row.revenueUsd)}
                        </td>
                        <td className="px-4 py-4 tabular-nums">
                          {money(row.matchedDays ? row.profitPlatformCostUsd : row.platformCostUsd)}
                        </td>
                        <td className="px-4 py-4 tabular-nums">
                          {row.recordedExpenses
                            ? money(
                                row.matchedDays ? row.profitExternalCostUsd : row.externalCostUsd,
                              )
                            : "No entries"}
                          {row.matchedDays > 0 && row.unmatchedExpenses > 0 && (
                            <p className="text-muted-foreground mt-1 text-xs">
                              {money(row.unmatchedExternalCostUsd)} on other days; see ledger
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4 tabular-nums">
                          {money(row.profitUsd)}
                          {row.matchedDays > 0 && !row.complete && (
                            <p className="text-muted-foreground mt-1 text-xs">Partial profit</p>
                          )}
                        </td>
                        <td className="px-4 py-4 tabular-nums">
                          {row.margin == null
                            ? row.profitUsd != null && row.profitRevenueUsd === 0
                              ? "N/A · zero revenue"
                              : "Unavailable"
                            : `${row.margin.toFixed(1)}%`}
                        </td>
                        <td className="text-muted-foreground px-4 py-4 text-xs">
                          <span className="text-foreground font-medium">
                            {row.complete
                              ? "Complete"
                              : row.matchedDays
                                ? "Partial"
                                : "No comparable days"}
                          </span>
                          <br />
                          Matched {row.matchedDays}/{row.days} days
                          <br />
                          Revenue {row.revenueDays}/{row.days} days
                          <br />
                          Cost {row.costDays}/{row.days} days
                          {row.coveredDates.length > 0 && (
                            <p className="mt-1">
                              {row.coveredDates[0]} to {row.coveredDates.at(-1)} (UTC; may have
                              gaps)
                            </p>
                          )}
                          {!row.matchedDays && " · Sync revenue and cost for the same days."}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
      <section className="border-border space-y-5 border-t pt-8">
        <h2 className="text-xl font-semibold">Record an external expense</h2>
        <WorkspaceState {...actors} retry={actors.refresh} />
        {actors.data?.length ? (
          <ExpenseForm
            key={`${actor}:${actors.data.map((item) => item.id).join(",")}`}
            actors={actors.data}
            selectedActor={actor}
            refresh={refresh}
            today={today}
          />
        ) : (
          actors.data && (
            <p className="text-muted-foreground text-sm">
              Import an Actor before recording expenses.
            </p>
          )
        )}
      </section>
      <section className="border-border space-y-5 border-t pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">External expense ledger</h2>
          <Button
            variant="outline"
            disabled={!ledger.data?.items.length}
            onClick={() =>
              downloadCsv("external-expenses-page.csv", [
                ["Actor", "Source", "Amount USD", "Incurred at UTC", "Run"],
                ...ledger.data!.items.map((row) => [
                  row.actor.title ?? row.actor.actorName,
                  row.source,
                  row.amountUsd,
                  row.incurredAt,
                  row.runId,
                ]),
              ])
            }
          >
            <Download />
            Export this page
          </Button>
        </div>
        <WorkspaceState {...ledger} retry={ledger.refresh} />
        {ledger.data && (
          <>
            <p className="text-muted-foreground text-sm">
              {ledger.data.total.toLocaleString()} entries ·{" "}
              {ledger.data.total
                ? `${money(ledger.data.totalUsd)} recorded`
                : "No expenses recorded for these dates"}
            </p>
            <p className="text-muted-foreground text-xs leading-5">{ledger.data.coverage}</p>
            {!ledger.data.items.length ? (
              <p className="border-border text-muted-foreground border p-6 text-sm">
                Record an external expense using the form above.
              </p>
            ) : (
              <div className="divide-border border-border divide-y border-y">
                {ledger.data.items.map((expense) => (
                  <article
                    key={expense.id}
                    className="flex flex-wrap items-center justify-between gap-4 py-4"
                  >
                    <div>
                      <h3 className="text-sm font-semibold">
                        {expense.source} · {expense.actor.title ?? expense.actor.actorName}
                      </h3>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {new Date(expense.incurredAt).toLocaleString("en-US", { timeZone: "UTC" })}{" "}
                        UTC
                        {expense.runId ? ` · Run ${expense.runId}` : " · Manual entry"}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium tabular-nums">
                        {money(Number(expense.amountUsd))}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending !== null}
                        onClick={() => remove(expense.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <PagePagination
              page={ledger.data.page}
              total={ledger.data.total}
              pageSize={ledger.data.pageSize}
              onChange={(page) => {
                const next = new URLSearchParams(params);
                next.set("page", String(page));
                router.replace(`/dashboard/profitability?${next}`);
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}
function ExpenseForm({
  actors,
  selectedActor,
  refresh,
  today,
}: {
  actors: IntelligenceActor[];
  selectedActor: string;
  refresh: () => void;
  today: string;
}) {
  const [actorId, setActorId] = useState(
    actors.find((item) => item.id === selectedActor)?.id ?? actors[0]!.id,
  );
  const [source, setSource] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [pending, setPending] = useState(false);
  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (
      !source.trim() ||
      !Number.isFinite(Number(amount)) ||
      Number(amount) < 0.000001 ||
      Number(amount) > 1000000 ||
      !date ||
      !actors.some((item) => item.id === actorId)
    )
      return;
    setPending(true);
    try {
      await intelligenceRequest(`/actors/${actorId}/costs`, "POST", {
        source: source.trim(),
        amountUsd: Number(amount),
        incurredAt: `${date}T00:00:00.000Z`,
      });
      setSource("");
      setAmount("");
      refresh();
      toast.success("Expense recorded. Adjust the report dates if it falls outside this range.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Expense could not be saved.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      onSubmit={add}
      className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[2fr_2fr_1fr_1fr_auto]"
    >
      <label htmlFor="expense-actor" className="space-y-2 text-sm font-medium">
        Actor
        <select
          id="expense-actor"
          className={fieldClass}
          value={actorId}
          onChange={(event) => setActorId(event.target.value)}
        >
          {actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.title ?? actor.actorName}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor="expense-source" className="space-y-2 text-sm font-medium">
        Service or source
        <Input
          id="expense-source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="Proxy, AI API, hosting…"
          required
          maxLength={100}
        />
      </label>
      <label htmlFor="expense-amount" className="space-y-2 text-sm font-medium">
        Amount (USD)
        <Input
          id="expense-amount"
          type="number"
          min={0.000001}
          max={1000000}
          step={0.000001}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
      </label>
      <label htmlFor="expense-date" className="space-y-2 text-sm font-medium">
        Expense date (UTC)
        <Input
          id="expense-date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Recording…" : "Record expense"}
      </Button>
    </form>
  );
}
