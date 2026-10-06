import "server-only";

import Decimal from "decimal.js";
import {
  assistantFinancialRequestSchema,
  type AssistantAnswer,
  type AssistantFinancialRequest,
  type AssistantFinancialTopic,
} from "@/domain/assistant/answers";
import type { AssistantReply } from "@/domain/assistant/contracts";
import type {
  ProjectDashboard,
  ProjectMetricKey,
  ProjectMetricRow,
} from "@/domain/finance/project-dashboard";
import { formatTimestamp } from "@/domain/payments/dates";
import {
  formatMoney,
  formatPercentage,
} from "@/domain/procurement/presentation";
import { getDatabase } from "@/lib/db";
import { getProjectControl } from "@/lib/reporting/project-control";

const SOURCE_LIMIT = 8;
const topics: Record<
  AssistantFinancialTopic,
  { title: string; keys: readonly ProjectMetricKey[]; paragraphs: string[] }
> = {
  overview: {
    title: "Project finances",
    keys: ["cost", "sell", "profit", "coverage", "cash"],
    paragraphs: [
      "Recorded cost includes active Orders, separate Project freight and non-deductible VAT, after Supplier credits. Pricing profit is Order sell HT less that cost; it is not final Project profit.",
      "Order coverage compares issued Client Invoice HT with Order sell HT. Net cash compares actual Client cash received with Supplier and freight cash paid, including actual refunds. Cash is not profit or a bank balance.",
    ],
  },
  costs_profit: {
    title: "Costs & profit",
    keys: ["cost", "sell", "profit"],
    paragraphs: [
      "Recorded cost includes active Order product, freight and other costs, plus separate Project freight once and non-deductible VAT. Supplier credits reduce cost without changing agreed selling prices.",
      "Pricing profit is agreed Order sell HT less recorded economic cost. Markup is that profit divided by cost, not margin on revenue. This is the recorded pricing position, not earned or final Project profit.",
    ],
  },
  billing_coverage: {
    title: "Billing coverage",
    keys: ["invoiced", "sell", "coverage", "planned", "toInvoice"],
    paragraphs: [
      "Order coverage is total issued Client Invoice HT after active credits minus active Order sell HT. All issued amounts count, including unallocated amounts; allocation approval does not limit this figure.",
      "Billing plan includes issued and To be invoiced Invoices. Quotes, Drafts and cancelled documents are excluded. Planned Billing, VAT and cash do not fund issued Order coverage.",
    ],
  },
  cash: {
    title: "Project cash",
    keys: ["received", "paid", "cash", "toCollect", "toPay"],
    paragraphs: [
      "Client received is recognized receipts less actual Client refunds. Supplier paid includes Supplier and Project freight payments less actual Supplier refunds. Each cash transaction uses its own recorded FX; credits alone create no cash.",
      "To collect is issued Invoice outstanding using Invoice FX, excluding planned Billing. To pay includes Supplier and freight obligations plus Client refunds due, including undated balances. These are all-date balances, not a timed cash forecast or bank balance.",
    ],
  },
  vat: {
    title: "VAT position",
    keys: ["vatOutput", "vatInput", "vatBalance"],
    paragraphs: [
      "VAT balance is issued Client Invoice output VAT minus deductible input VAT on active Orders and Project freight, after credit reductions. Positive means payable; negative means a VAT credit.",
      "Stored recoverable fractions determine deductible VAT. Non-deductible VAT remains economic cost; cash timing and planned Order output VAT do not enter this management position. This is not a tax filing calculation.",
    ],
  },
  freight: {
    title: "Freight coverage",
    keys: [
      "freightCost",
      "freightTarget",
      "freightInvoiced",
      "freightReceived",
      "freightInvoicedGap",
      "freightPaidGap",
    ],
    paragraphs: [
      "Freight cost includes Order freight and separate Project freight HT once. The target applies the Project default freight markup; it does not change Order prices or Billing.",
      "Invoiced and paid coverage compare Client freight HT with that target. Freight received is a capped reporting attribution of net actual cash after credits and refunds, using actual cash FX; it is not an extra receipt or revenue.",
    ],
  },
};

const labels: Partial<Record<ProjectMetricKey, string>> = {
  cost: "Recorded cost",
  sell: "Order sell HT",
  profit: "Pricing profit",
  planned: "Billing plan HT",
  invoiced: "Invoiced HT",
  toInvoice: "To invoice HT",
  coverage: "Order coverage HT",
  received: "Client received TTC",
  paid: "Supplier paid TTC",
  cash: "Net cash TTC",
  toCollect: "To collect TTC",
  toPay: "To pay TTC",
  freightCost: "Freight cost HT",
  freightTarget: "Freight target HT",
  freightInvoiced: "Freight invoiced HT",
  freightReceived: "Freight received HT",
  freightInvoicedGap: "Invoiced coverage HT",
  freightPaidGap: "Paid coverage HT",
  vatOutput: "Output VAT",
  vatInput: "Deductible VAT",
  vatBalance: "VAT balance",
};

function sourceLinks(rows: ProjectMetricRow[]) {
  const sources = new Map<
    string,
    NonNullable<AssistantAnswer["sources"]>[number]
  >();
  // Missing sources stay visible even when the complete source list is longer.
  const ordered = [
    ...rows.filter((row) => row.amount === null),
    ...rows.filter((row) => row.amount !== null),
  ];
  for (const row of ordered) {
    if (sources.has(row.href)) continue;
    sources.set(row.href, {
      label: row.label,
      href: row.href,
      ...(row.amount === null
        ? {
            note: `Incomplete amount. ${row.note ?? "Review this record and its required manual FX."}`,
          }
        : row.note
          ? { note: row.note }
          : {}),
    });
  }
  return {
    sources: [...sources.values()].slice(0, SOURCE_LIMIT),
    sourceCount: sources.size,
  };
}

function coverageConclusion(dashboard: ProjectDashboard): string {
  const value = dashboard.metrics.coverage.value;
  if (value === null)
    return "Order coverage is incomplete. Review missing amounts or manual FX before deciding whether enough has been invoiced.";
  const coverage = new Decimal(value);
  if (coverage.isNegative())
    return "Issued Billing is below Order sell: there is a billing shortfall, not necessarily a loss.";
  return coverage.isZero()
    ? "Issued Billing exactly covers Order sell. This does not mean the Client has paid or final Project profit is secured."
    : "Issued Billing exceeds Order sell. This is commercial coverage, not cash received or final Project profit.";
}

function financialWarnings(
  dashboard: ProjectDashboard,
  keys: readonly ProjectMetricKey[],
  topic: AssistantFinancialTopic,
) {
  const warnings: string[] = [];
  if (keys.some((key) => dashboard.metrics[key].value === null))
    warnings.push(
      "Incomplete amounts are not zero. Review the linked records and required manual FX; complete figures remain shown separately.",
    );
  if (topic === "cash" || topic === "overview") {
    const cashAlerts = dashboard.alerts.filter((alert) =>
      [
        "Excluded receipt",
        "Cost payable review",
        "Cash review needed",
      ].includes(alert.label),
    );
    for (const note of new Set(cashAlerts.map((alert) => alert.note))) {
      if (warnings.length >= 3) break;
      warnings.push(note);
    }
    if (cashAlerts.length > 2)
      warnings.push(
        "More cash review items are available on the Project page.",
      );
  }
  return warnings;
}

/** Read-model adapter only. Auth belongs to the calling Server Action. */
export async function readAssistantFinancials(
  input: AssistantFinancialRequest,
): Promise<AssistantReply> {
  const request = assistantFinancialRequestSchema.parse(input);
  const project = await getDatabase().project.findUnique({
    where: { id: request.projectId },
    select: { id: true, name: true, code: true },
  });
  if (!project)
    return {
      message:
        "This Project is no longer available. Choose another Project to see its finances.",
      query: null,
      moreHref: null,
      results: [],
      truncated: false,
    };

  const { currency, dashboard } = await getProjectControl(project.id);
  const definition = topics[request.topic];
  const projectHref = `/projects/${project.id}`;
  const metrics: NonNullable<AssistantAnswer["metrics"]> = definition.keys.map(
    (key) => ({
      label: labels[key] ?? key,
      value:
        dashboard.metrics[key].value === null
          ? null
          : formatMoney(dashboard.metrics[key].value, currency),
      href: projectHref,
    }),
  );
  if (request.topic === "overview" || request.topic === "costs_profit") {
    const cost = dashboard.metrics.cost.value;
    metrics.push({
      label: "Markup",
      value:
        dashboard.markupRate === null
          ? cost !== null &&
            dashboard.metrics.sell.value !== null &&
            new Decimal(cost).isZero()
            ? "Not applicable"
            : null
          : formatPercentage(dashboard.markupRate),
      href: projectHref,
    });
  }
  const paragraphs = [...definition.paragraphs];
  if (request.topic === "overview" || request.topic === "billing_coverage")
    paragraphs.push(coverageConclusion(dashboard));
  const evidence = sourceLinks(
    definition.keys.flatMap((key) => dashboard.metrics[key].rows),
  );
  const warnings = financialWarnings(dashboard, definition.keys, request.topic);
  return {
    message:
      "Current Project figures, using the same calculations as Project Details.",
    query: null,
    moreHref: null,
    results: [],
    truncated: false,
    financial: request,
    answer: {
      title: `${project.name} · ${definition.title}`,
      paragraphs,
      metrics,
      links: [{ label: "Open Project", href: projectHref }],
      ...evidence,
      warnings,
      asOf: formatTimestamp(new Date()),
    },
  };
}
