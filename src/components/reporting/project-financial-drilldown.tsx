"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { formatMoney } from "@/domain/procurement/presentation";
import { formatDateOnly } from "@/domain/payments/dates";
import {
  projectFinancialRows,
  type ProjectFinancialRow,
  type FinancialPeriod,
} from "@/domain/projects/financial-drilldown";

const views: Record<
  string,
  {
    title: string;
    kinds: ProjectFinancialRow["kind"][];
    period: FinancialPeriod;
  }
> = {
  billed: { title: "Invoiced revenue HT", kinds: ["billed"], period: "all" },
  cost: { title: "Recorded economic cost", kinds: ["cost"], period: "all" },
  commercial: {
    title: "Billing less recorded economic cost",
    kinds: ["billed", "cost"],
    period: "all",
  },
  received: {
    title: "Actual client receipts TTC",
    kinds: ["received"],
    period: "all",
  },
  paid: {
    title: "Actual Supplier & freight payments TTC",
    kinds: ["paid"],
    period: "all",
  },
  cash: {
    title: "Actual Project cash · receipts less payments",
    kinds: ["received", "paid"],
    period: "all",
  },
  incoming: {
    title: "Client outstanding TTC · all dates",
    kinds: ["issued"],
    period: "all",
  },
  outgoing: {
    title: "Supplier & freight outstanding TTC · all dates",
    kinds: ["payment"],
    period: "all",
  },
  upcomingIn: {
    title: "Client receipts due in selected period",
    kinds: ["issued"],
    period: "upcoming",
  },
  upcomingOut: {
    title: "Supplier & freight due in selected period",
    kinds: ["payment"],
    period: "upcoming",
  },
  forecast: {
    title: "Cash projection · actual cash and upcoming commitments",
    kinds: ["received", "paid", "issued", "payment"],
    period: "all",
  },
  overdue: {
    title: "Overdue commitments TTC",
    kinds: ["issued", "payment"],
    period: "overdue",
  },
  overdueIn: {
    title: "Overdue client receipts TTC",
    kinds: ["issued"],
    period: "overdue",
  },
  overdueOut: {
    title: "Overdue Supplier & freight payments TTC",
    kinds: ["payment"],
    period: "overdue",
  },
  undated: {
    title: "Undated / unscheduled commitments TTC",
    kinds: ["issued", "payment"],
    period: "undated",
  },
  planned: {
    title: "Planned client receipts TTC · all dates",
    kinds: ["planned"],
    period: "all",
  },
  plannedUpcoming: {
    title: "Planned receipts · selected period",
    kinds: ["planned"],
    period: "upcoming",
  },
  plannedOverdue: {
    title: "Past planned receipt dates",
    kinds: ["planned"],
    period: "overdue",
  },
  plannedUndated: {
    title: "Undated / unscheduled planned receipts",
    kinds: ["planned"],
    period: "undated",
  },
};
const labels: Record<ProjectFinancialRow["kind"], string> = {
  billed: "Client Invoice HT",
  cost: "Economic cost",
  received: "Cash in TTC",
  paid: "Cash out TTC",
  issued: "Client outstanding TTC",
  payment: "Supplier/freight outstanding TTC",
  planned: "Planned receipt TTC",
};
const DrilldownContext = createContext<((key: string) => void) | null>(null);
export function ProjectFinancialLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const open = useContext(DrilldownContext);
  if (href.startsWith("#financial:") && open)
    return (
      <button
        type="button"
        className={className}
        onClick={() => open(href.slice(11))}
      >
        {children}
      </button>
    );
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
export function ProjectFinancialDrilldowns({
  rows,
  currency,
  today,
  end,
  children,
}: {
  rows: readonly ProjectFinancialRow[];
  currency: string;
  today: string;
  end: string;
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const view = selected ? views[selected] : undefined;
  const visible = view
    ? projectFinancialRows(rows, view.kinds, view.period, today, end).filter(
        (row) =>
          selected !== "forecast" ||
          row.kind === "paid" ||
          row.kind === "received" ||
          (row.due !== null && row.due >= today && row.due <= end),
      )
    : [];
  return (
    <DrilldownContext.Provider value={setSelected}>
      {children}
      {view && (
        <EditorDrawer
          open
          title={view.title}
          description="Supporting records for this Project figure."
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        >
          <p className="text-muted-foreground text-sm">
            Amounts in {currency}. Open a source record to review or edit its
            details. Missing FX or inconsistent source data stays incomplete.
          </p>
          {(view.period === "upcoming" || selected === "forecast") && (
            <p className="mt-2 text-xs">
              {formatDateOnly(today)}–{formatDateOnly(end)}. Overdue, undated
              and unissued plans are separate.
            </p>
          )}
          {visible.length === 0 ? (
            <p className="py-6 text-sm">No matching records.</p>
          ) : (
            <ul className="mt-4 divide-y">
              {visible.map((row, index) => (
                <li key={`${row.kind}:${row.href}:${index}`} className="py-3">
                  <Link
                    className="text-sm font-medium underline underline-offset-4"
                    href={row.href}
                  >
                    {row.label}
                  </Link>
                  <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {labels[row.kind]}
                      {row.due ? ` · ${formatDateOnly(row.due)}` : ""}
                    </span>
                    <span className="financial-figure">
                      {row.amount === null
                        ? "Incomplete · check source data and FX"
                        : formatMoney(row.amount, currency)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </EditorDrawer>
      )}
    </DrilldownContext.Provider>
  );
}
