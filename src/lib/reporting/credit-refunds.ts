import "server-only";
import Decimal from "decimal.js";
import { getDatabase } from "@/lib/db";
import { dateOnlyToDate, dateToDateOnly } from "@/domain/payments/dates";
import { reportingAmount } from "@/domain/finance/calculations";
import { activeCreditsInclude } from "@/lib/credits/select";
import { billingCashContexts } from "@/domain/billing/cash-expectations";
import { getClientCreditPosition } from "@/domain/billing/credits";

/** Refunds have no schedule. Report their existence without inventing timing or FX. */
export async function listClientRefundObligations(
  projectIds: readonly string[],
) {
  if (!projectIds.length) return [];
  const receipts = { select: { id: true, amount: true } } as const;
  const records = await getDatabase().clientBillingDocument.findMany({
    where: {
      projectId: { in: [...projectIds] },
      documentType: "INVOICE",
      isCancelled: false,
      workflowStatus: { notIn: ["DRAFT", "TO_BE_INVOICED", "CANCELLED"] },
    },
    include: {
      credits: activeCreditsInclude,
      receipts,
      paymentInstallments: { include: { receipts } },
      matchedInstallment: { include: { receipts } },
    },
  });
  return billingCashContexts(records).flatMap(({ document, reviewReason }) => {
    if (reviewReason || !document.projectId || !document.credits.length)
      return [];
    const amount = getClientCreditPosition(document).refundDue;
    return new Decimal(amount).greaterThan(0)
      ? [
          {
            id: document.id,
            projectId: document.projectId,
            amount,
            currencyCode: document.currencyCode,
          },
        ]
      : [];
  });
}

export async function listCreditRefundCash(
  projectIds: readonly string[],
  filters: {
    supplierId?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
  } = {},
) {
  if (!projectIds.length) return [];
  const rows = await getDatabase().financialCreditRefund.findMany({
    where: {
      isCancelled: false,
      refundDate: {
        ...(filters.dateFrom ? { gte: dateOnlyToDate(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: dateOnlyToDate(filters.dateTo) } : {}),
      },
      credit: {
        isCancelled: false,
        OR: [
          {
            side: "SUPPLIER",
            order: {
              projectId: { in: [...projectIds] },
              status: { not: "CANCELLED" },
              ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
            },
          },
          ...(!filters.supplierId
            ? [
                {
                  side: "CLIENT",
                  billingDocument: {
                    projectId: { in: [...projectIds] },
                    documentType: "INVOICE" as const,
                    isCancelled: false,
                    workflowStatus: {
                      notIn: ["DRAFT", "TO_BE_INVOICED", "CANCELLED"],
                    },
                  },
                },
              ]
            : []),
        ],
      },
    },
    include: {
      credit: {
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              project: {
                select: { id: true, name: true, reportingCurrencyCode: true },
              },
              supplier: { select: { displayName: true } },
            },
          },
          billingDocument: {
            select: {
              id: true,
              reference: true,
              project: {
                select: { id: true, name: true, reportingCurrencyCode: true },
              },
              client: { select: { displayName: true } },
            },
          },
        },
      },
    },
    orderBy: [{ refundDate: "asc" }, { id: "asc" }],
  });
  return rows.flatMap((row) => {
    const credit = row.credit;
    const source =
      credit.side === "SUPPLIER" ? credit.order : credit.billingDocument;
    if (!source?.project) return [];
    const isOutflow = credit.side === "CLIENT";
    return [
      {
        id: row.id,
        amount: row.amount.toString(),
        currencyCode: credit.currencyCode,
        fxRate: row.fxRateToReporting?.toString() ?? null,
        receivedAt: dateToDateOnly(row.refundDate),
        isOutflow,
        projectId: source.project.id,
        projectName: source.project.name,
        reportingCurrencyCode: source.project.reportingCurrencyCode,
        reportingAmount:
          credit.reportingCurrencyCode !== source.project.reportingCurrencyCode
            ? null
            : (reportingAmount({
                originalAmount: row.amount.toString(),
                originalCurrencyCode: credit.currencyCode,
                reportingCurrencyCode: source.project.reportingCurrencyCode,
                fxRateToReporting: row.fxRateToReporting?.toString() ?? null,
              })?.toString() ?? null),
        sourceId: source.id,
        sourceReference:
          credit.side === "SUPPLIER"
            ? (credit.order?.orderNumber ?? credit.reference)
            : (credit.billingDocument?.reference ?? credit.reference),
        partyName:
          credit.side === "SUPPLIER"
            ? (credit.order?.supplier?.displayName ?? "Unassigned")
            : (credit.billingDocument?.client?.displayName ?? "Unassigned"),
        reference: row.reference,
        creditFreightHt: credit.freightCoverageHt.toString(),
        creditTotalTtc: new Decimal(credit.totalHt.toString())
          .plus(credit.vatAmount.toString())
          .toString(),
        label: `${isOutflow ? "Client refund" : "Supplier refund"} · ${credit.reference}`,
        href: `${isOutflow ? "/billing" : "/orders"}/${source.id}?tab=related#credits`,
      },
    ];
  });
}
export type CreditRefundCash = Awaited<
  ReturnType<typeof listCreditRefundCash>
>[number];
