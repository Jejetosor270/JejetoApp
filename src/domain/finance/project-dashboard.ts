import Decimal from "decimal.js";
import { sumKnown } from "./project-control";
import { calculateProjectActualProfitability } from "@/domain/projects/targets";

export interface ProjectMetricRow {
  label: string;
  href: string;
  amount: string | null;
  note?: string;
}

export interface ProjectMetric {
  value: string | null;
  rows: ProjectMetricRow[];
  help: string;
}

export interface ProjectDashboardAlert {
  label: string;
  href: string;
  note: string;
}

export const projectMetricKeys = [
  "cost",
  "sell",
  "profit",
  "planned",
  "invoiced",
  "toInvoice",
  "coverage",
  "received",
  "paid",
  "cash",
  "toCollect",
  "toPay",
  "expectedCost",
  "expectedProfit",
  "freightCost",
  "freightTarget",
  "freightInvoiced",
  "freightReceived",
  "freightInvoicedGap",
  "freightPaidGap",
  "vatOutput",
  "vatInput",
  "vatBalance",
] as const;
export type ProjectMetricKey = (typeof projectMetricKeys)[number];
export interface ProjectDashboard {
  metrics: Record<ProjectMetricKey, ProjectMetric>;
  markupRate: string | null;
  expectedMarkupRate: string | null;
  alerts: ProjectDashboardAlert[];
}

export interface ProjectDashboardInput {
  cost: ProjectMetricRow[];
  sell: ProjectMetricRow[];
  invoiced: ProjectMetricRow[];
  toInvoice: ProjectMetricRow[];
  receipts: ProjectMetricRow[];
  supplierPayments: ProjectMetricRow[];
  freightPayments: ProjectMetricRow[];
  clientRefunds: ProjectMetricRow[];
  supplierRefunds: ProjectMetricRow[];
  toCollect: ProjectMetricRow[];
  toPay: ProjectMetricRow[];
  budget: ProjectMetricRow[];
  nonDeductibleVat: ProjectMetricRow[];
  freightCost: ProjectMetricRow[];
  freightInvoiced: ProjectMetricRow[];
  freightReceived: ProjectMetricRow[];
  vatOutput: ProjectMetricRow[];
  vatInput: ProjectMetricRow[];
  freightMarkupRate: string;
  alerts: ProjectDashboardAlert[];
}

const sourceKeys = [
  "cost",
  "sell",
  "invoiced",
  "toInvoice",
  "receipts",
  "supplierPayments",
  "freightPayments",
  "clientRefunds",
  "supplierRefunds",
  "toCollect",
  "toPay",
  "budget",
  "nonDeductibleVat",
  "freightCost",
  "freightInvoiced",
  "freightReceived",
  "vatOutput",
  "vatInput",
] as const;

/** Preserve each source total at storage precision without a hidden rounding row. */
export function reconciledProjectRows(
  rows: readonly ProjectMetricRow[],
): ProjectMetricRow[] {
  let running = new Decimal(0);
  let previous = new Decimal(0);
  return rows.map((row) => {
    if (row.amount === null) return { ...row };
    running = running.plus(row.amount);
    const rounded = running.toDecimalPlaces(4);
    const amount = rounded.minus(previous).toFixed(4);
    previous = rounded;
    return { ...row, amount };
  });
}

/** Signed source rows are the calculation, not a separately maintained explanation. */
export function projectMetric(
  rows: ProjectMetricRow[],
  help: string,
): ProjectMetric {
  return { value: sumKnown(rows.map((row) => row.amount)), rows, help };
}

export function subtractProjectRows(
  rows: readonly ProjectMetricRow[],
): ProjectMetricRow[] {
  return rows.map((row) => ({
    ...row,
    amount:
      row.amount === null ? null : new Decimal(row.amount).negated().toString(),
  }));
}

/** Decimal-only Project read model. Empty activity is zero; an unknown input stays unknown. */
export function projectDashboard(
  source: ProjectDashboardInput,
): ProjectDashboard {
  const input = { ...source };
  for (const key of sourceKeys) input[key] = reconciledProjectRows(source[key]);
  const received = [
    ...input.receipts,
    ...subtractProjectRows(input.clientRefunds),
  ];
  const paid = [
    ...input.supplierPayments,
    ...input.freightPayments,
    ...subtractProjectRows(input.supplierRefunds),
  ];
  const planned = [...input.invoiced, ...input.toInvoice];
  const expectedCost = [...input.budget, ...input.nonDeductibleVat];
  const freightTarget = input.freightCost.map((row) => ({
    ...row,
    amount:
      row.amount === null
        ? null
        : new Decimal(row.amount)
            .times(new Decimal(1).plus(input.freightMarkupRate))
            .toString(),
    note: "Freight HT cost with the Project freight markup applied.",
  }));
  const metrics: ProjectDashboard["metrics"] = {
    cost: projectMetric(
      input.cost,
      "Current active Order economic costs plus separate Project freight expenses once. Non-deductible input VAT is included; Supplier credits reduce cost.",
    ),
    sell: projectMetric(
      input.sell,
      "Agreed selling HT on active Orders. Project-only freight adds cost but creates no invented selling price.",
    ),
    profit: projectMetric(
      [...input.sell, ...subtractProjectRows(input.cost)],
      "Recorded Order selling HT minus all recorded economic costs, including Project-only freight. This is the recorded pricing scope, not final Project profit.",
    ),
    planned: projectMetric(
      planned,
      "Issued and To be invoiced Client Invoice HT after credits. Quotes, Drafts and cancelled documents are excluded.",
    ),
    invoiced: projectMetric(
      input.invoiced,
      "Issued Client Invoice HT after active Client credits, whether allocated or at Project level.",
    ),
    toInvoice: projectMetric(
      input.toInvoice,
      "To be invoiced Client Invoice HT after credits. These amounts are planned revenue and do not create issued receivables.",
    ),
    coverage: projectMetric(
      [...input.invoiced, ...subtractProjectRows(input.sell)],
      "Total issued Client Invoice HT after active credits minus active Order selling HT. All issued amounts count, whether allocated or not; Project remainder approval is not required. Planned Billing, VAT and payments are excluded. Positive means billed above Order sell; negative means a billing shortfall, not a loss.",
    ),
    received: projectMetric(
      received,
      "Recognized actual Client receipts less actual Client refunds, each using its own recorded cash FX. Credits alone create no cash.",
    ),
    paid: projectMetric(
      paid,
      "Actual Supplier settlements and Project freight payments less actual Supplier refunds, each using its own recorded cash FX.",
    ),
    cash: projectMetric(
      [...received, ...subtractProjectRows(paid)],
      "Net Client cash received minus net Supplier and freight cash paid. This is tracked Project cash, not a bank balance.",
    ),
    toCollect: projectMetric(
      input.toCollect,
      "Authoritative issued Client Invoice outstanding TTC after credits and recognized receipts, using the Invoice commercial FX. Expected term FX remains separate in cash forecasts. Planned Billing and Supplier refunds due are excluded.",
    ),
    toPay: projectMetric(
      input.toPay,
      "Remaining Supplier payable and Project freight obligations plus Client refunds due. Includes unscheduled and undated balances. Order freight, customs and other cost lines do not invent payable obligations.",
    ),
    expectedCost: projectMetric(
      expectedCost,
      "Complete approved full-Project HT budget plus currently known non-deductible input VAT. Budget replaces recorded HT costs in this estimate; it is not added to them. Future non-deductible VAT and unreviewed costs may still be missing.",
    ),
    expectedProfit: projectMetric(
      [...planned, ...subtractProjectRows(expectedCost)],
      "Planned Billing HT minus the complete approved Project cost budget and known non-deductible input VAT. Missing budget inputs keep this estimate incomplete; this is not a cost-to-complete forecast.",
    ),
    freightCost: projectMetric(
      input.freightCost,
      "Order freight HT plus separate Project freight expense HT once, excluding input VAT.",
    ),
    freightTarget: projectMetric(
      freightTarget,
      "Recorded freight HT cost with the Project default freight markup applied. This reporting target does not change Order prices or Billing.",
    ),
    freightInvoiced: projectMetric(
      input.freightInvoiced,
      "Freight HT included in issued Client Invoices, reduced by active freight credits. It is a subset of Invoice revenue.",
    ),
    freightReceived: projectMetric(
      input.freightReceived,
      "Reporting attribution of net actual Client cash to net Invoice freight HT after credits. Each receipt and actual refund uses its own cash FX; attribution is capped by the remaining freight portion.",
    ),
    freightInvoicedGap: projectMetric(
      [...input.freightInvoiced, ...subtractProjectRows(freightTarget)],
      "Net Client freight invoiced HT minus the Project-default freight recovery target.",
    ),
    freightPaidGap: projectMetric(
      [...input.freightReceived, ...subtractProjectRows(freightTarget)],
      "Attributed Client freight received HT minus the Project-default freight recovery target.",
    ),
    vatOutput: projectMetric(
      input.vatOutput,
      "Output VAT on issued Client Invoices less active Client credit VAT. Planned Order output VAT is excluded.",
    ),
    vatInput: projectMetric(
      input.vatInput,
      "Deductible input VAT on active Orders and separate Project freight, after Supplier credit reductions. Stored recoverable fractions are applied.",
    ),
    vatBalance: projectMetric(
      [...input.vatOutput, ...subtractProjectRows(input.vatInput)],
      "Issued Client output VAT minus deductible Order and Project freight input VAT. A positive amount is payable; a negative amount is a credit.",
    ),
  };
  const alerts = new Map<string, ProjectDashboardAlert>();
  for (const alert of input.alerts)
    alerts.set(`${alert.label}:${alert.href}`, alert);
  for (const row of Object.values(metrics).flatMap((metric) => metric.rows)) {
    if (row.amount !== null) continue;
    const label = input.budget.some(
      (budget) => budget.href === row.href && budget.label === row.label,
    )
      ? "Budget incomplete"
      : "Incomplete amount";
    const key = `${label}:${row.href}`;
    if (!alerts.has(key))
      alerts.set(key, {
        label,
        href: row.href,
        note: `${row.label}: ${row.note ?? "Review the source amount and required manual FX."}`,
      });
  }
  return {
    metrics,
    markupRate: calculateProjectActualProfitability(
      metrics.cost.value,
      metrics.sell.value,
    ).markupRate,
    expectedMarkupRate: calculateProjectActualProfitability(
      metrics.expectedCost.value,
      metrics.planned.value,
    ).markupRate,
    alerts: [...alerts.values()],
  };
}
