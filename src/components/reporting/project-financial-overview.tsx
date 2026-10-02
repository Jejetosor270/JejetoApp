"use client";

import Link from "next/link";
import { EditProjectBudgetButton } from "@/components/projects/project-budget-context";
import {
  formatMoney,
  formatRate,
  formatSignedMoney,
} from "@/domain/procurement/presentation";
import type { ProjectVatPosition } from "@/domain/vat/position";
import type { ProjectControl } from "@/lib/reporting/project-control";

interface Figure {
  label: string;
  value: string | null;
  href?: string;
  signed?: boolean;
  rate?: boolean;
  help?: string;
  detail?: string;
}

function Figures({
  currency,
  figures,
  columns = 3,
}: {
  currency: string;
  figures: readonly Figure[];
  columns?: 3 | 4;
}) {
  return (
    <dl
      className={`mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 ${columns === 4 ? "xl:grid-cols-4" : "lg:grid-cols-3"}`}
    >
      {figures.map((figure) => {
        const value = figure.rate
          ? figure.value === null
            ? "Not available"
            : formatRate(figure.value)
          : figure.value === null
            ? "Incomplete"
            : figure.signed
              ? formatSignedMoney(figure.value, currency)
              : formatMoney(figure.value, currency);
        return (
          <div key={figure.label} className="min-w-0" title={figure.help}>
            <dt className="text-muted-foreground text-xs">{figure.label}</dt>
            <dd className="financial-figure mt-1 overflow-x-auto text-lg font-semibold tracking-tight">
              {figure.href ? (
                <Link
                  className="focus-visible:outline-ring rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
                  href={figure.href}
                >
                  {value}
                </Link>
              ) : (
                value
              )}
              {figure.detail ? (
                <span className="text-muted-foreground mt-1 block text-xs font-normal">
                  {figure.detail}
                </span>
              ) : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function VatCostNote({
  value,
  currency,
}: {
  value: string | null;
  currency: string;
}) {
  if (value === null || /^0(?:\.0+)?$/.test(value)) return null;
  return (
    <p className="text-muted-foreground mt-3 text-xs">
      Profit deducts {formatMoney(value, currency)} non-deductible VAT.
    </p>
  );
}

export function ProjectFinancialOverview({
  data,
  projectId,
  vatPosition,
}: {
  data: Pick<
    ProjectControl,
    "currency" | "overview" | "freightCoverage" | "excludedReceiptCount"
  >;
  projectId: string;
  vatPosition: ProjectVatPosition;
}) {
  const { overview, currency, freightCoverage: freight } = data;
  const related = (section: string) =>
    `/projects/${projectId}?tab=related&section=${section}`;
  const billing = related("work");
  const purchasing = related("orders");
  const payments = related("payment-terms");
  const vatLabel =
    vatPosition.status === "CREDIT"
      ? "VAT credit"
      : vatPosition.status === "PAYABLE"
        ? "VAT payable"
        : "VAT balance";
  return (
    <div className="space-y-4">
      <section
        className="record-surface"
        aria-labelledby="project-invoiced-heading"
      >
        <h2 id="project-invoiced-heading" className="text-sm font-semibold">
          Invoiced HT
        </h2>
        <Figures
          currency={currency}
          figures={[
            {
              label: "Client invoiced HT",
              value: overview.invoiced.clientHt,
              href: billing,
            },
            {
              label: "Recorded cost HT",
              value: overview.invoiced.costHt,
              help: "All active Order costs plus Project freight, including freight and other costs once.",
            },
            {
              label: "Difference HT",
              value: overview.invoiced.balanceHt,
              signed: true,
              help: "Issued Client Invoice HT minus recorded HT costs. This is not final profit.",
            },
          ]}
        />
      </section>
      <section
        className="record-surface"
        aria-labelledby="project-cash-heading"
      >
        <h2 id="project-cash-heading" className="text-sm font-semibold">
          Cash TTC
        </h2>
        <Figures
          currency={currency}
          figures={[
            {
              label: "Client received TTC",
              value: overview.cash.receivedTtc,
              href: payments,
              help: "Recognized Client receipts, net of actual Client refunds.",
            },
            {
              label: "Supplier paid TTC",
              value: overview.cash.paidTtc,
              help: "Supplier and Project freight payments, net of actual Supplier refunds.",
            },
            {
              label: "Cash balance TTC",
              value: overview.cash.balanceTtc,
              signed: true,
              help: "Client received minus Supplier paid. Tracked Project cash, not a bank balance.",
            },
            {
              label: "Recorded payable TTC",
              value: overview.funding.recordedPayableTtc,
              help: "Full recorded Supplier and Project freight obligations after credits, including amounts already paid. Not only outstanding balances.",
            },
            {
              label: "Funding balance TTC",
              value: overview.funding.balanceTtc,
              signed: true,
              help: "Net Client receipts minus full recorded payable. Not actual cash balance.",
            },
          ]}
        />
        {data.excludedReceiptCount > 0 ? (
          <p className="text-warning-foreground mt-3 text-xs" role="status">
            Some receipts need review.{" "}
            <Link className="underline" href={billing}>
              Open Billing
            </Link>
          </p>
        ) : null}
      </section>
      <section
        className="record-surface"
        aria-labelledby="project-orders-heading"
      >
        <h2 id="project-orders-heading" className="text-sm font-semibold">
          Orders HT
        </h2>
        <Figures
          currency={currency}
          columns={4}
          figures={[
            {
              label: "Order cost HT",
              value: overview.orders.costHt,
              href: purchasing,
              help: "Active Orders: purchase, freight, customs and other costs. Separate Project freight is included in Recorded cost, not counted again here.",
            },
            {
              label: "Order sell HT",
              value: overview.orders.sellHt,
              href: purchasing,
              help: "Agreed Order selling prices, retaining individual markups and direct prices.",
            },
            {
              label: "Planned profit",
              value: overview.orders.profitHt,
              signed: true,
              help: "Order selling prices minus Order economic cost. Not Client invoiced revenue.",
            },
            {
              label: "Markup",
              value: overview.orders.markupRate,
              rate: true,
              help: "Order profit divided by aggregated economic cost, not an average of Order percentages.",
            },
          ]}
        />
        <VatCostNote
          value={overview.orders.nonDeductibleVat}
          currency={currency}
        />
      </section>
      <section
        className="record-surface"
        aria-labelledby="project-planned-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="project-planned-heading" className="text-sm font-semibold">
            Planned HT
          </h2>
          <EditProjectBudgetButton />
        </div>
        <Figures
          currency={currency}
          figures={[
            {
              label: "Planned billing HT",
              value: overview.planned.billingHt,
              href: billing,
              help: "Issued and To be invoiced Client Invoices, net of credits. Excludes Quotes, Drafts and cancelled records.",
            },
            {
              label: "Target profit",
              value: overview.planned.targetProfitHt,
              detail:
                overview.planned.targetMarginRate === null
                  ? "Margin not available"
                  : `${formatRate(overview.planned.targetMarginRate)} margin`,
              help: "Profit within planned Billing, calculated from each category's Project markup.",
            },
            {
              label: "Target markup",
              value: overview.planned.targetMarkupRate,
              rate: true,
              help: "Combined target profit divided by implied cost, using the Project category markups. The profit's margin is its share of planned Billing.",
            },
            {
              label: "Coverage gap HT",
              value: overview.planned.coverageHt,
              signed: true,
              help: "Planned Billing minus agreed Order selling totals. Positive is a surplus; negative is a shortfall.",
            },
            {
              label: "Provisional profit",
              value: overview.planned.profitHt,
              signed: true,
              help: "Planned Billing minus all recorded economic costs, including Project freight. Future costs may still be missing.",
            },
            {
              label: "Provisional markup",
              value: overview.planned.markupRate,
              rate: true,
              help: "Provisional profit divided by recorded economic cost. This is not a final-profit forecast.",
            },
          ]}
        />
        <p className="text-muted-foreground mt-3 text-xs">
          Includes To be invoiced. Future costs may be missing.
        </p>
        <VatCostNote
          value={overview.planned.nonDeductibleVat}
          currency={currency}
        />
      </section>
      <section
        id="finance"
        className="record-surface"
        aria-labelledby="project-vat-heading"
      >
        <h2 id="project-vat-heading" className="text-sm font-semibold">
          VAT
        </h2>
        <Figures
          currency={currency}
          figures={[
            {
              label: "Output VAT",
              value: vatPosition.outputVat,
              href: billing,
            },
            {
              label: "Deductible VAT",
              value: vatPosition.deductibleInputVat,
              href: purchasing,
            },
            {
              label: vatLabel,
              value: vatPosition.positionAmount,
              help: "Issued Client Invoice output VAT minus deductible Order and Project freight input VAT, after credits. Management view, not a tax return.",
            },
          ]}
        />
      </section>
      <section
        className="record-surface"
        aria-labelledby="project-freight-heading"
      >
        <h2 id="project-freight-heading" className="text-sm font-semibold">
          Freight HT
        </h2>
        <Figures
          currency={currency}
          figures={[
            {
              label: "Freight cost HT",
              value: freight.supplierHt,
            },
            {
              label: "Freight target HT",
              value: freight.supplierSellHt,
              help: "Order freight plus Project freight HT, with the Project freight markup.",
            },
            {
              label: "Client invoiced HT",
              value: freight.clientInvoicedHt,
              href: billing,
            },
            {
              label: "Client received HT",
              value: freight.clientPaidHt,
              href: payments,
              help: "Proportional freight share of actual receipts, not a separately recorded freight payment.",
            },
            {
              label: "Invoiced coverage HT",
              value: freight.invoicedCoverageHt,
              signed: true,
              help: "Client freight invoiced minus freight target.",
            },
            {
              label: "Paid coverage HT",
              value: freight.paidCoverageHt,
              signed: true,
              help: "Client freight received share minus freight target.",
            },
          ]}
        />
      </section>
    </div>
  );
}
