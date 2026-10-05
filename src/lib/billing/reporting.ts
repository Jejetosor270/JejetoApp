import { cache } from "react";
import {
  earliestUnpaidTermDate,
  overdueTermAmount,
} from "@/domain/payments/terms";
import "server-only";

import Decimal from "decimal.js";
import {
  billingCashContexts,
  uniqueReceiptTotal,
} from "@/domain/billing/cash-expectations";
import { cappedCashTerms } from "@/domain/payments/cash-expectations";

import { COMPANY_REPORTING_CURRENCY_CODE } from "@/config/reporting";
import {
  allocationReconciliation,
  calculateClientBillingAmounts,
  isRecognizedClientReceivable,
} from "@/domain/billing/calculations";
import { reportingAmount } from "@/domain/finance/calculations";
import { derivePaymentStatus } from "@/domain/payments/calculations";
import { businessToday, dateToDateOnly } from "@/domain/payments/dates";
import { ClientBillingDocumentType, Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { activeCreditsInclude } from "@/lib/credits/select";
import { getClientCreditPosition } from "@/domain/billing/credits";

const billingReportingInclude = {
  credits: activeCreditsInclude,
  allocations: {
    include: { order: { select: { status: true } } },
  },
  matchedInstallment: {
    include: { receipts: true },
  },
  paymentInstallments: {
    include: { receipts: true },
  },
  receipts: true,
} satisfies Prisma.ClientBillingDocumentInclude;

type BillingReportingRecord = Prisma.ClientBillingDocumentGetPayload<{
  include: typeof billingReportingInclude;
}>;
const activeRecordCredits = (record: BillingReportingRecord) =>
  (record.credits ?? []).filter((credit) => !credit.isCancelled);

function receiptRecords(record: BillingReportingRecord) {
  const matched =
    record.matchedInstallment?.currencyCode === record.currencyCode
      ? record.matchedInstallment.receipts
      : [];
  return [
    ...new Map(
      [...record.receipts, ...matched].map((receipt) => [receipt.id, receipt]),
    ).values(),
  ];
}

function converted(
  amount: string,
  currencyCode: string,
  reportingCurrencyCode: string,
  fxRate: string | null,
) {
  return reportingAmount({
    fxRateToReporting: fxRate,
    originalAmount: amount,
    originalCurrencyCode: currencyCode,
    reportingCurrencyCode,
  });
}

function earlierDate(current: string | null, candidate: string): string {
  return current === null || candidate < current ? candidate : current;
}

function createBillingSummaryState() {
  const quoted = new Decimal(0);
  const invoiced = new Decimal(0);
  const invoicedTtc = new Decimal(0);
  const outputVat = new Decimal(0);
  const coverage = new Decimal(0);
  const invoiceOutstanding = new Decimal(0);
  const paid = new Decimal(0);
  const refunded = new Decimal(0);
  const overdue = new Decimal(0);
  const upcomingScheduled = new Decimal(0);
  const nextDueDate = null as string | null;
  const scheduleComplete: boolean = true;
  const today = businessToday();
  const missingIds = new Set<string>();
  const invoiceMissingIds = new Set<string>();
  const outputVatMissingIds = new Set<string>();
  const coverageMissingIds = new Set<string>();
  const uniqueReceipts = new Map<
    string,
    ReturnType<typeof receiptRecords>[number] & { currencyCode: string }
  >();
  const uniqueInstallments = new Map<
    string,
    { amount: string; due: string | null; currency: string; fx: string | null }
  >();
  const uniqueRefunds = new Map<
    string,
    { amount: string; currency: string; fx: string | null }
  >();

  return {
    quoted,
    invoiced,
    invoicedTtc,
    outputVat,
    coverage,
    invoiceOutstanding,
    paid,
    refunded,
    overdue,
    upcomingScheduled,
    nextDueDate,
    scheduleComplete,
    today,
    missingIds,
    invoiceMissingIds,
    outputVatMissingIds,
    coverageMissingIds,
    uniqueReceipts,
    uniqueInstallments,
    uniqueRefunds,
  };
}

type BillingSummaryState = ReturnType<typeof createBillingSummaryState>;

function addDocumentRevenue(
  state: BillingSummaryState,
  record: BillingReportingRecord,
  reportingCurrencyCode: string,
  fxRate: string | null,
) {
  const convertedHt = converted(
    record.totalHt.toString(),
    record.currencyCode,
    reportingCurrencyCode,
    fxRate,
  );
  if (convertedHt === null) {
    state.missingIds.add(record.id);
    if (record.documentType === ClientBillingDocumentType.INVOICE)
      state.invoiceMissingIds.add(record.id);
  } else if (record.documentType === ClientBillingDocumentType.QUOTE) {
    state.quoted = state.quoted.plus(convertedHt);
  } else {
    state.invoiced = state.invoiced.plus(convertedHt);
  }
  if (record.documentType === ClientBillingDocumentType.INVOICE)
    for (const credit of activeRecordCredits(record)) {
      const reduction = converted(
        credit.totalHt.toString(),
        credit.currencyCode,
        reportingCurrencyCode,
        credit.fxRateToReporting?.toString() ?? null,
      );
      if (reduction === null) {
        state.missingIds.add(credit.id);
        state.invoiceMissingIds.add(credit.id);
      } else state.invoiced = state.invoiced.minus(reduction);
    }
}

/** The same eligible signed contributions power the Projects list and record drilldowns. */
export function invoiceCoverageContributions(
  record: BillingReportingRecord,
  reportingCurrencyCode: string,
  fxRate = record.fxRateToReporting?.toString() ?? null,
) {
  const rows: {
    id: string;
    label: string;
    href: string;
    amount: string | null;
    note: string;
  }[] = [];
  const allocatedHt = record.allocations
    .filter((allocation) => allocation.order.status !== "CANCELLED")
    .reduce(
      (total, allocation) => total.plus(allocation.allocatedAmount),
      new Decimal(0),
    );
  const remainingHt = allocationReconciliation(
    record.totalHt.toString(),
    record.allocations.map((allocation) =>
      allocation.allocatedAmount.toString(),
    ),
  ).remaining;
  const coverageOriginal = record.isProjectRemainderApproved
    ? allocatedHt.plus(remainingHt)
    : allocatedHt;
  if (!coverageOriginal.isZero()) {
    const convertedCoverage = converted(
      coverageOriginal.toString(),
      record.currencyCode,
      reportingCurrencyCode,
      fxRate,
    );
    rows.push({
      id: record.id,
      label: record.reference,
      href: `/billing/${record.id}?tab=related#allocations`,
      amount: convertedCoverage?.toString() ?? null,
      note: "Issued Invoice allocations to active Orders plus any explicitly approved Project remainder.",
    });
  }
  for (const credit of activeRecordCredits(record)) {
    const activeOrderIds = new Set(
      record.allocations
        .filter((allocation) => allocation.order.status !== "CANCELLED")
        .map((allocation) => allocation.orderId),
    );
    const allocated = credit.allocations.reduce(
      (sum, allocation) => sum.plus(allocation.amountHt),
      new Decimal(0),
    );
    const activeAllocated = credit.allocations
      .filter((allocation) => activeOrderIds.has(allocation.orderId))
      .reduce(
        (sum, allocation) => sum.plus(allocation.amountHt),
        new Decimal(0),
      );
    const amount = activeAllocated.plus(
      record.isProjectRemainderApproved
        ? new Decimal(credit.totalHt).minus(allocated)
        : 0,
    );
    const reduction =
      credit.reportingCurrencyCode !== reportingCurrencyCode
        ? null
        : converted(
            amount.toFixed(4),
            credit.currencyCode,
            reportingCurrencyCode,
            credit.fxRateToReporting?.toString() ?? null,
          );
    rows.push({
      id: credit.id,
      label: `${record.reference} · ${credit.reference}`,
      href: `/billing/${record.id}?tab=related#credits`,
      amount: reduction?.negated().toString() ?? null,
      note: "Credit reduction of active Order allocations and any approved Project remainder.",
    });
  }
  return rows;
}

function addInvoiceCoverage(
  state: BillingSummaryState,
  record: BillingReportingRecord,
  reportingCurrencyCode: string,
  fxRate: string | null,
) {
  for (const row of invoiceCoverageContributions(
    record,
    reportingCurrencyCode,
    fxRate,
  )) {
    if (row.amount === null) state.coverageMissingIds.add(row.id);
    else state.coverage = state.coverage.plus(row.amount);
  }
}

function addInvoiceTotals(
  state: BillingSummaryState,
  record: BillingReportingRecord,
  reportingCurrencyCode: string,
  fxRate: string | null,
) {
  if (record.documentType !== ClientBillingDocumentType.INVOICE) return;
  addInvoiceCoverage(state, record, reportingCurrencyCode, fxRate);
  const convertedTtc = converted(
    record.totalTtc.toString(),
    record.currencyCode,
    reportingCurrencyCode,
    fxRate,
  );
  if (convertedTtc === null) state.missingIds.add(record.id);
  else state.invoicedTtc = state.invoicedTtc.plus(convertedTtc);
  const convertedVat = converted(
    record.vatAmount.toString(),
    record.currencyCode,
    reportingCurrencyCode,
    fxRate,
  );
  if (convertedVat === null) {
    state.missingIds.add(record.id);
    state.outputVatMissingIds.add(record.id);
  } else state.outputVat = state.outputVat.plus(convertedVat);
  for (const credit of activeRecordCredits(record)) {
    const rate = credit.fxRateToReporting?.toString() ?? null;
    const ttc = converted(
      new Decimal(credit.totalHt).plus(credit.vatAmount).toFixed(4),
      credit.currencyCode,
      reportingCurrencyCode,
      rate,
    );
    const vat = converted(
      credit.vatAmount.toString(),
      credit.currencyCode,
      reportingCurrencyCode,
      rate,
    );
    if (ttc === null) state.missingIds.add(credit.id);
    else state.invoicedTtc = state.invoicedTtc.minus(ttc);
    if (vat === null) {
      state.missingIds.add(credit.id);
      state.outputVatMissingIds.add(credit.id);
    } else state.outputVat = state.outputVat.minus(vat);
  }
}

function collectBillingCash(
  state: BillingSummaryState,
  record: BillingReportingRecord,
  reviewRequired: boolean,
) {
  const creditPosition = getClientCreditPosition(record, [
    uniqueReceiptTotal(receiptRecords(record)),
  ]);
  for (const credit of activeRecordCredits(record))
    for (const refund of credit.refunds.filter((row) => !row.isCancelled))
      state.uniqueRefunds.set(refund.id, {
        amount: refund.amount.toString(),
        currency: credit.currencyCode,
        fx: refund.fxRateToReporting?.toString() ?? null,
      });
  for (const receipt of record.documentType ===
  ClientBillingDocumentType.INVOICE
    ? receiptRecords(record)
    : []) {
    state.uniqueReceipts.set(receipt.id, {
      ...receipt,
      currencyCode: record.currencyCode,
    });
  }
  const visibleInstallments = record.matchedInstallment
    ? [record.matchedInstallment]
    : record.paymentInstallments;
  if (reviewRequired) {
    if (isRecognizedClientReceivable(record)) {
      state.scheduleComplete = false;
      state.missingIds.add(record.id);
    }
  } else if (isRecognizedClientReceivable(record)) {
    const schedule = cappedCashTerms(
      creditPosition.netDue,
      activeRecordCredits(record).length
        ? Decimal.min(creditPosition.netDue, creditPosition.netPaid).toString()
        : creditPosition.netPaid,
      visibleInstallments.map((term) => ({
        id: term.id,
        amount: term.scheduledAmount.toString(),
        paid: uniqueReceiptTotal(term.receipts),
        due: dateToDateOnly(term.dueDate ?? record.dueDate),
        cancelled: term.isCancelled,
        currency: term.currencyCode,
        fx: term.expectedFxRateToReporting?.toString() ?? null,
      })),
    );
    for (const { term, amount } of schedule.terms) {
      state.uniqueInstallments.set(term.id, {
        ...term,
        amount: amount.toString(),
      });
    }
  }

  return visibleInstallments;
}

function addReceivableBalance(
  state: BillingSummaryState,
  record: BillingReportingRecord,
  reportingCurrencyCode: string,
  fxRate: string | null,
  visibleInstallments: BillingReportingRecord["paymentInstallments"],
) {
  if (!isRecognizedClientReceivable(record)) return;
  const terms = visibleInstallments.map((term) => ({
    dueDate: dateToDateOnly(term.dueDate),
    isCancelled: term.isCancelled,
    scheduledAmount: term.scheduledAmount.toString(),
    payments: term.receipts.map((payment) => ({
      amount: payment.amount.toString(),
    })),
  }));
  const view = calculateClientBillingAmounts({
    documentType: record.documentType,
    dueDate: earliestUnpaidTermDate(terms, dateToDateOnly(record.dueDate)),
    isCancelled: record.isCancelled,
    paidAmounts: receiptRecords(record).map((receipt) =>
      receipt.amount.toString(),
    ),
    today: state.today,
    totalTtc: record.totalTtc.toString(),
    ...getClientCreditPosition(record),
  });
  const outstanding = converted(
    view.outstanding,
    record.currencyCode,
    reportingCurrencyCode,
    fxRate,
  );
  if (outstanding === null) {
    state.missingIds.add(record.id);
    return;
  }
  state.invoiceOutstanding = state.invoiceOutstanding.plus(outstanding);
  const overdueValue = converted(
    overdueTermAmount({
      terms,
      outstanding: view.outstanding,
      fallbackDate: dateToDateOnly(record.dueDate),
      today: state.today,
    }),
    record.currencyCode,
    reportingCurrencyCode,
    fxRate,
  );
  if (overdueValue === null) state.missingIds.add(record.id);
  else state.overdue = state.overdue.plus(overdueValue);
}

function addActualReceipts(
  state: BillingSummaryState,
  reportingCurrencyCode: string,
) {
  for (const receipt of state.uniqueReceipts.values()) {
    const convertedReceipt = converted(
      receipt.amount.toString(),
      receipt.currencyCode,
      reportingCurrencyCode,
      receipt.fxRateToReporting?.toString() ?? null,
    );
    if (convertedReceipt === null) state.missingIds.add(receipt.id);
    else state.paid = state.paid.plus(convertedReceipt);
  }
  for (const [id, refund] of state.uniqueRefunds) {
    const amount = converted(
      refund.amount,
      refund.currency,
      reportingCurrencyCode,
      refund.fx,
    );
    if (amount === null) state.missingIds.add(id);
    else state.refunded = state.refunded.plus(amount);
  }
}

function addUpcomingTerms(
  state: BillingSummaryState,
  reportingCurrencyCode: string,
) {
  for (const installment of state.uniqueInstallments.values()) {
    const outstanding = new Decimal(installment.amount);
    const dueDate = installment.due;
    if (!dueDate || outstanding.isZero() || dueDate < state.today) continue;
    state.nextDueDate = earlierDate(state.nextDueDate, dueDate);
    const convertedOutstanding = converted(
      outstanding.toString(),
      installment.currency,
      reportingCurrencyCode,
      installment.fx,
    );
    if (convertedOutstanding === null) state.scheduleComplete = false;
    else
      state.upcomingScheduled =
        state.upcomingScheduled.plus(convertedOutstanding);
  }
}

export function summarizeClientBillingRecords(
  records: readonly BillingReportingRecord[],
  reportingCurrencyCode: string,
) {
  const state = createBillingSummaryState();
  const contexts = new Map(
    billingCashContexts(records).map((context) => [
      context.document.id,
      context,
    ]),
  );
  for (const record of records) {
    if (
      record.isCancelled ||
      !record.projectId ||
      (record.documentType === "INVOICE" &&
        !isRecognizedClientReceivable(record))
    )
      continue;
    const fxRate = record.fxRateToReporting?.toString() ?? null;
    addDocumentRevenue(state, record, reportingCurrencyCode, fxRate);
    addInvoiceTotals(state, record, reportingCurrencyCode, fxRate);
    const reviewRequired = Boolean(contexts.get(record.id)?.reviewReason);
    const terms = collectBillingCash(state, record, reviewRequired);
    if (!reviewRequired)
      addReceivableBalance(state, record, reportingCurrencyCode, fxRate, terms);
  }
  addActualReceipts(state, reportingCurrencyCode);
  addUpcomingTerms(state, reportingCurrencyCode);
  const {
    quoted,
    invoiced,
    invoicedTtc,
    outputVat,
    coverage,
    invoiceOutstanding,
    paid,
    refunded,
    overdue,
    upcomingScheduled,
    nextDueDate,
    scheduleComplete,
    missingIds,
    invoiceMissingIds,
    outputVatMissingIds,
    coverageMissingIds,
  } = state;
  return {
    complete: missingIds.size === 0,
    coverageComplete: coverageMissingIds.size === 0,
    coverageHt: coverage.toFixed(4),
    coverageMissingIds: [...coverageMissingIds],
    invoiceMissingIds: [...invoiceMissingIds],
    invoicedComplete: invoiceMissingIds.size === 0,
    invoicedHt: invoiced.toFixed(4),
    invoicedTtc: invoicedTtc.toFixed(4),
    missingIds: [...missingIds],
    nextDueDate,
    outstandingTtc: invoiceOutstanding.toFixed(4),
    overdueTtc: overdue.toFixed(4),
    outputVat: outputVat.toFixed(4),
    outputVatComplete: outputVatMissingIds.size === 0,
    outputVatMissingIds: [...outputVatMissingIds],
    paidTtc: paid.toFixed(4),
    refundedTtc: refunded.toFixed(4),
    netPaidTtc: paid.minus(refunded).toFixed(4),
    quotedHt: quoted.toFixed(4),
    reportingCurrencyCode,
    scheduleComplete,
    upcomingScheduledTtc: scheduleComplete
      ? upcomingScheduled.toFixed(4)
      : null,
  };
}

export type ClientBillingSummary = ReturnType<
  typeof summarizeClientBillingRecords
>;

export const getProjectClientBillingSummary = cache(
  async function getProjectClientBillingSummary(projectId: string) {
    const project = await getDatabase().project.findUnique({
      where: { id: projectId },
      select: {
        billingDocuments: {
          where: { isCancelled: false },
          include: billingReportingInclude,
        },
        reportingCurrencyCode: true,
      },
    });
    return project
      ? summarizeClientBillingRecords(
          project.billingDocuments,
          project.reportingCurrencyCode,
        )
      : null;
  },
);

export async function getProjectsClientBillingSummaries(
  projects: readonly { id: string; reportingCurrencyCode: string }[],
) {
  if (projects.length === 0) return new Map<string, ClientBillingSummary>();
  const records = await getDatabase().clientBillingDocument.findMany({
    where: {
      isCancelled: false,
      projectId: { in: projects.map((project) => project.id) },
    },
    include: billingReportingInclude,
  });
  const recordsByProject = new Map<string, BillingReportingRecord[]>();
  for (const record of records) {
    if (
      record.isCancelled ||
      (record.documentType === "INVOICE" &&
        !isRecognizedClientReceivable(record))
    )
      continue;
    if (!record.projectId) continue;
    const values = recordsByProject.get(record.projectId) ?? [];
    values.push(record);
    recordsByProject.set(record.projectId, values);
  }
  return new Map(
    projects.map((project) => [
      project.id,
      summarizeClientBillingRecords(
        recordsByProject.get(project.id) ?? [],
        project.reportingCurrencyCode,
      ),
    ]),
  );
}

export async function getPortfolioClientBillingSummary() {
  const records = await getDatabase().clientBillingDocument.findMany({
    where: {
      isCancelled: false,
      project: {
        reportingCurrencyCode: COMPANY_REPORTING_CURRENCY_CODE,
        status: "ACTIVE",
      },
    },
    include: billingReportingInclude,
  });
  const summary = summarizeClientBillingRecords(
    records,
    COMPANY_REPORTING_CURRENCY_CODE,
  );
  return {
    complete: summary.complete,
    currencyCode: COMPANY_REPORTING_CURRENCY_CODE,
    invoicedHt: summary.invoicedHt,
    outstandingTtc: summary.outstandingTtc,
    overdueTtc: summary.overdueTtc,
    paidTtc: summary.paidTtc,
  };
}

export interface ClientCashInstallment {
  reviewReason?: string | null;
  cashKind?: "issued" | "planned";
  clientId?: string;
  receivedAmount?: string;
  documentType?: string;
  billingDocumentId: string;
  billingReference: string;
  clientName: string;
  currencyCode: string;
  dueDate: string | null;
  expectedFxRate: string | null;
  id: string;
  isCancelled: boolean;
  label: string;
  outstandingAmount: string;
  projectId: string;
  projectName: string;
  scheduledAmount: string;
  status: ReturnType<typeof derivePaymentStatus>;
}

/** Authoritative Billing schedules for forecasts and overdue reporting. */
export async function listClientCashInstallments(
  projectIds?: readonly string[],
): Promise<ClientCashInstallment[]> {
  if (projectIds?.length === 0) return [];
  const documents = await getDatabase().clientBillingDocument.findMany({
    where: {
      isCancelled: false,
      workflowStatus: { notIn: ["DRAFT", "CANCELLED"] },
      ...(projectIds ? { projectId: { in: [...projectIds] } } : {}),
    },
    orderBy: { documentType: "desc" },
    select: {
      credits: activeCreditsInclude,
      client: { select: { id: true, displayName: true } },
      documentType: true,
      currencyCode: true,
      workflowStatus: true,
      isCancelled: true,
      totalTtc: true,
      receipts: { select: { id: true, amount: true } },
      dueDate: true,
      id: true,
      matchedInstallment: {
        select: {
          currencyCode: true,
          dueDate: true,
          expectedFxRateToReporting: true,
          id: true,
          isCancelled: true,
          label: true,
          receipts: { select: { id: true, amount: true } },
          scheduledAmount: true,
        },
      },
      paymentInstallments: {
        select: {
          currencyCode: true,
          dueDate: true,
          expectedFxRateToReporting: true,
          id: true,
          isCancelled: true,
          label: true,
          receipts: { select: { id: true, amount: true } },
          scheduledAmount: true,
        },
      },
      project: { select: { id: true, name: true } },
      reference: true,
    },
  });
  const today = businessToday();
  const unique = new Map<string, ClientCashInstallment>();
  for (const context of billingCashContexts(documents)) {
    const { document } = context;
    const terms = context.terms.map((term) => ({
      source: term,
      amount: term.scheduledAmount.toString(),
      paid: context.reviewReason ? "0" : uniqueReceiptTotal(term.receipts),
      due: dateToDateOnly(term.dueDate ?? document.dueDate),
      cancelled: term.isCancelled,
    }));
    // Diagnostic amounts remain original-currency evidence only. Consumers must not aggregate them.
    const schedule = context.reviewReason
      ? {
          terms: terms.map((term) => ({
            term,
            amount: new Decimal(term.amount),
          })),
        }
      : cappedCashTerms(
          context.total,
          document.credits?.some((credit) => !credit.isCancelled)
            ? Decimal.min(context.total, context.paid).toString()
            : context.paid,
          terms,
        );
    for (const { term, amount: outstanding } of schedule.terms) {
      const installment = term.source;
      const received = new Decimal(term.paid);
      const dueDate = term.due;
      const id = context.reviewReason
        ? `${document.id}:${installment.id}`
        : installment.id;
      unique.set(id, {
        reviewReason: context.reviewReason,
        cashKind: context.kind,
        clientId: document.client?.id ?? "",
        ...(!context.reviewReason
          ? { receivedAmount: received.toString() }
          : {}),
        documentType: document.documentType,
        billingDocumentId: document.id,
        billingReference: document.reference,
        clientName: document.client?.displayName ?? "Unassigned",
        currencyCode: installment.currencyCode,
        dueDate,
        expectedFxRate:
          installment.expectedFxRateToReporting?.toString() ?? null,
        id,
        isCancelled: installment.isCancelled,
        label: installment.label,
        outstandingAmount: outstanding.toString(),
        projectId: document.project?.id ?? "",
        projectName: document.project?.name ?? "Unassigned",
        scheduledAmount: installment.scheduledAmount.toString(),
        status: derivePaymentStatus({
          dueDate,
          isCancelled: installment.isCancelled,
          // A document-level receipt reduces forecast balance, not stored term cash.
          paidAmount: new Decimal(term.amount).minus(outstanding),
          scheduledAmount: term.amount,
          today,
        }),
      });
    }
  }
  return [...unique.values()];
}
