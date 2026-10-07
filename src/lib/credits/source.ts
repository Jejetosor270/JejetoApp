import "server-only";
import Decimal from "decimal.js";
import { supplierPayableBase } from "@/domain/payments/calculations";
import type { Prisma } from "@/generated/prisma/client";
import { billingIsIssued } from "@/domain/billing/status";
import { uniqueReceiptTotal } from "@/domain/billing/cash-expectations";
import { resolveRecoverableRate } from "@/domain/vat/recoverability";
import {
  creditCashPosition,
  remainingAfterCredits,
  type CreditAmount,
} from "@/domain/credits/calculations";
import { creditHistoryInclude } from "./select";
import { editVersion } from "@/lib/edit-version";

export class CreditError extends Error {}
export interface CreditScope {
  side: "CLIENT" | "SUPPLIER";
  sourceId: string;
}
export type CreditRecord = Prisma.FinancialCreditGetPayload<
  typeof creditHistoryInclude
>;
export interface CreditSource {
  side: CreditScope["side"];
  sourceId: string;
  projectId: string | null;
  reference: string;
  currencyCode: string;
  reportingCurrencyCode: string;
  fxRateToReporting: string | null;
  eligible: boolean;
  blockedReason: string | null;
  snapshot: object;
  original: CreditAmount & { totalTtc: string };
  paidTtc: string;
  credits: CreditRecord[];
  orderAllocations: {
    orderId: string;
    reference: string;
    amountHt: string;
    freightCoverageHt: string;
    otherCoverageHt: string;
  }[];
  supplierVatEntry: {
    id: string;
    treatment: string;
    vatAmount: string;
    recoverableRate: string | null;
  } | null;
}

const sum = (rows: readonly { amount: { toString(): string } }[]) =>
  rows
    .reduce((total, row) => total.plus(row.amount.toString()), new Decimal(0))
    .toFixed(4);
export function asCreditAmount(credit: {
  totalHt: { toString(): string };
  vatAmount: { toString(): string };
  freightCoverageHt: { toString(): string };
  otherCoverageHt: { toString(): string };
}): CreditAmount {
  return {
    totalHt: credit.totalHt.toString(),
    vatAmount: credit.vatAmount.toString(),
    freightCoverageHt: credit.freightCoverageHt.toString(),
    otherCoverageHt: credit.otherCoverageHt.toString(),
  };
}

export async function loadCreditSource(
  tx: Prisma.TransactionClient,
  scope: CreditScope,
): Promise<CreditSource> {
  if (scope.side === "CLIENT") {
    const source = await tx.clientBillingDocument.findUnique({
      where: { id: scope.sourceId },
      include: {
        project: { select: { reportingCurrencyCode: true } },
        receipts: true,
        matchedInstallment: {
          include: {
            receipts: true,
            matchedInvoices: {
              where: {
                isCancelled: false,
                workflowStatus: { notIn: ["DRAFT", "CANCELLED"] },
              },
              select: { id: true },
            },
          },
        },
        allocations: {
          include: {
            order: { select: { orderNumber: true, projectId: true } },
          },
        },
        credits: creditHistoryInclude,
      },
    });
    if (!source)
      throw new CreditError("The original Billing document is unavailable.");
    const reporting =
      source.project?.reportingCurrencyCode ??
      source.detachedReportingCurrencyCode;
    const matched = source.matchedInstallment;
    const blockedReason =
      matched &&
      (matched.currencyCode !== source.currencyCode ||
        matched.matchedInvoices.length > 1)
        ? "Review the original Invoice's ambiguous or mixed-currency payment-term match before crediting it."
        : null;
    return {
      ...scope,
      projectId: source.projectId,
      reference: source.reference,
      currencyCode: source.currencyCode,
      reportingCurrencyCode: reporting ?? source.currencyCode,
      fxRateToReporting: source.fxRateToReporting?.toString() ?? null,
      eligible:
        source.documentType === "INVOICE" &&
        billingIsIssued(source) &&
        Boolean(reporting && source.clientId),
      blockedReason,
      snapshot: source,
      original: {
        totalHt: source.totalHt.toString(),
        vatAmount: source.vatAmount.toString(),
        totalTtc: source.totalTtc.toString(),
        freightCoverageHt: source.freightCoverageHt.toString(),
        otherCoverageHt: source.otherCoverageHt.toString(),
      },
      paidTtc: uniqueReceiptTotal([
        ...source.receipts,
        ...(!blockedReason ? (matched?.receipts ?? []) : []),
      ]),
      credits: source.credits,
      orderAllocations: source.allocations.map((row) => ({
        orderId: row.orderId,
        reference: row.order.orderNumber,
        amountHt: row.allocatedAmount.toString(),
        freightCoverageHt: row.freightCoverageHt.toString(),
        otherCoverageHt: row.otherCoverageHt.toString(),
      })),
      supplierVatEntry: null,
    };
  }
  const source = await tx.procurementOrder.findUnique({
    where: { id: scope.sourceId },
    include: {
      project: { select: { reportingCurrencyCode: true } },
      costLines: true,
      vatEntries: true,
      paymentInstallments: {
        where: { direction: "SUPPLIER_PAYMENT" },
        include: { settlements: true },
      },
      credits: creditHistoryInclude,
    },
  });
  if (!source)
    throw new CreditError("The original Supplier Order is unavailable.");
  const purchase =
    source.costLines
      .find((row) => row.category === "SUPPLIER_PURCHASE")
      ?.originalAmount.toString() ?? "0";
  const inputVatEntries = source.vatEntries.filter(
    (row) => row.direction === "INPUT",
  );
  const vat = inputVatEntries[0];
  const payableVat =
    vat && ["DOMESTIC", "CUSTOM"].includes(vat.treatment)
      ? vat.vatAmount.toString()
      : "0";
  let recoverableRate: string | null = null;
  if (vat) {
    try {
      recoverableRate = resolveRecoverableRate(vat).toString();
    } catch {
      /* Missing classification blocks VAT reversal below, not an HT credit. */
    }
  }
  const reporting =
    source.project?.reportingCurrencyCode ??
    source.detachedReportingCurrencyCode;
  const mixed = source.paymentInstallments.some(
    (term) =>
      term.currencyCode !== source.orderCurrencyCode &&
      (!term.isCancelled || term.settlements.length > 0),
  );
  return {
    ...scope,
    projectId: source.projectId,
    reference: source.orderNumber,
    currencyCode: source.orderCurrencyCode,
    reportingCurrencyCode: reporting ?? source.orderCurrencyCode,
    fxRateToReporting: source.purchaseFxRateToReporting?.toString() ?? null,
    eligible:
      source.status !== "CANCELLED" && Boolean(reporting && source.supplierId),
    blockedReason:
      inputVatEntries.length > 1
        ? "Review the original Order's multiple input VAT entries before crediting it; a VAT source must be unambiguous."
        : mixed
          ? "Review the original Order's mixed-currency payment terms before crediting it."
          : null,
    snapshot: source,
    original: {
      totalHt: purchase,
      vatAmount: payableVat,
      // Credit HT remains limited to products; cash obligations include all Order costs.
      totalTtc: supplierPayableBase({
        supplierPurchase: purchase,
        freight: source.costLines
          .find((row) => row.category === "FREIGHT")
          ?.originalAmount.toString(),
        customsDuties: source.costLines
          .find((row) => row.category === "CUSTOMS_DUTIES")
          ?.originalAmount.toString(),
        miscellaneous: source.costLines
          .find((row) => row.category === "MISCELLANEOUS")
          ?.originalAmount.toString(),
        inputVatAmount: payableVat,
        inputVatTreatment: vat?.treatment,
      }).toFixed(4),
      freightCoverageHt: "0",
      otherCoverageHt: "0",
    },
    paidTtc: mixed
      ? "0"
      : sum(source.paymentInstallments.flatMap((term) => term.settlements)),
    credits: source.credits,
    orderAllocations: [],
    supplierVatEntry: vat
      ? {
          id: vat.id,
          treatment: vat.treatment,
          vatAmount: payableVat,
          recoverableRate,
        }
      : null,
  };
}

export function sourceCreditPosition(source: CreditSource) {
  const active = source.credits.filter((credit) => !credit.isCancelled);
  const remaining = remainingAfterCredits(
    source.original,
    active.map(asCreditAmount),
  );
  const refundedTtc = sum(
    active.flatMap((credit) =>
      credit.refunds.filter((refund) => !refund.isCancelled),
    ),
  );
  return {
    remaining,
    cash: {
      paidTtc: source.paidTtc,
      refundedTtc,
      ...creditCashPosition({
        originalTtc: source.original.totalTtc,
        creditedTtc: remaining.creditedTtc,
        paidTtc: source.paidTtc,
        refundedTtc,
        preserveRecordedRefunds: source.side === "SUPPLIER",
      }),
    },
    expectedVersion: editVersion(source.snapshot),
  };
}

export function assertCreditSourceReady(
  source: CreditSource,
  expectedVersion: string,
) {
  if (!source.eligible)
    throw new CreditError(
      "Credits require an active original issued Invoice or Supplier Order with its party and reporting currency.",
    );
  if (source.blockedReason) throw new CreditError(source.blockedReason);
  if (editVersion(source.snapshot) !== expectedVersion)
    throw new CreditError(
      "The original document, credits or cash changed. Reopen the credit form and review the current balances; your draft has not been saved.",
    );
}
