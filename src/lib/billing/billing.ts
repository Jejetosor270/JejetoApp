import "server-only";

import Decimal from "decimal.js";

import {
  ClientBillingAllocationBasis,
  ClientBillingDocumentType,
  ClientDocumentImportAction,
  InstallmentBasis,
  Prisma,
} from "@/generated/prisma/client";
import {
  allocationReconciliation,
  calculateClientBillingAmounts,
} from "@/domain/billing/calculations";
import type {
  ClientBillingConfirmation,
  ClientReceiptInput,
  InlineClientBillingInput,
} from "@/domain/billing/validation";
import { reportingAmount } from "@/domain/finance/calculations";
import {
  reconcileSchedule,
  scheduledAmountFromPercentage,
} from "@/domain/payments/calculations";
import {
  businessToday,
  dateOnlyToDate,
  dateToDateOnly,
} from "@/domain/payments/dates";
import { paginationSkip, type PageInput } from "@/domain/listing/validation";
import { writeAuditEvent } from "@/lib/audit/events";
import { getDatabase } from "@/lib/db";
import { COMPANY_REPORTING_CURRENCY_CODE } from "@/config/reporting";

export class ClientBillingValidationError extends Error {}
export class ClientBillingNotFoundError extends Error {}

const billingInclude = {
  allocations: {
    include: { order: { select: { orderNumber: true } } },
    orderBy: { createdAt: "asc" },
  },
  client: { select: { displayName: true, id: true } },
  matchedInstallment: {
    include: { receipts: { orderBy: { receivedAt: "asc" } } },
  },
  paymentInstallments: {
    include: { receipts: { orderBy: { receivedAt: "asc" } } },
    orderBy: { sequence: "asc" },
  },
  project: {
    select: { id: true, name: true, reportingCurrencyCode: true },
  },
} satisfies Prisma.ClientBillingDocumentInclude;

type BillingRecord = Prisma.ClientBillingDocumentGetPayload<{
  include: typeof billingInclude;
}>;

function receiptRecords(record: BillingRecord) {
  const own = record.paymentInstallments.flatMap(
    (installment) => installment.receipts,
  );
  const matched = record.matchedInstallment?.receipts ?? [];
  return [
    ...new Map(
      [...own, ...matched].map((receipt) => [receipt.id, receipt]),
    ).values(),
  ];
}

function billingView(record: BillingRecord, today = businessToday()) {
  const receipts = receiptRecords(record);
  const visibleInstallments = record.matchedInstallment
    ? [record.matchedInstallment]
    : record.paymentInstallments;
  const calculated = calculateClientBillingAmounts({
    documentType: record.documentType,
    dueDate: record.dueDate ? dateToDateOnly(record.dueDate) : null,
    isCancelled: record.isCancelled,
    paidAmounts: receipts.map((receipt) => receipt.amount.toString()),
    today,
    totalTtc: record.totalTtc.toString(),
  });
  const reconciliation = allocationReconciliation(
    record.totalHt.toString(),
    record.allocations.map((allocation) =>
      allocation.allocatedAmount.toString(),
    ),
  );
  return {
    allocations: record.allocations.map((allocation) => ({
      allocatedAmount: allocation.allocatedAmount.toString(),
      basis: allocation.basis,
      id: allocation.id,
      orderId: allocation.orderId,
      orderNumber: allocation.order.orderNumber,
      percentageRate: allocation.percentageRate?.toString() ?? null,
    })),
    allocationReconciliation: reconciliation,
    client: record.client,
    clientId: record.clientId,
    currencyCode: record.currencyCode,
    documentDate: dateToDateOnly(record.documentDate),
    documentType: record.documentType,
    dueDate: record.dueDate ? dateToDateOnly(record.dueDate) : null,
    fxRate: record.fxRateToReporting?.toString() ?? null,
    id: record.id,
    isCancelled: record.isCancelled,
    isProjectRemainderApproved: record.isProjectRemainderApproved,
    matchedInstallmentId: record.matchedInstallmentId,
    notes: record.notes,
    outstanding: calculated.outstanding,
    paid: calculated.paid,
    paymentInstallments: visibleInstallments.map((installment) => ({
      basis: installment.basis,
      currencyCode: installment.currencyCode,
      dueDate: dateToDateOnly(installment.dueDate),
      id: installment.id,
      isCancelled: installment.isCancelled,
      label: installment.label,
      notes: installment.notes,
      percentageRate: installment.percentageRate?.toString() ?? null,
      receipts: installment.receipts.map((receipt) => ({
        amount: receipt.amount.toString(),
        fxRate: receipt.fxRateToReporting?.toString() ?? null,
        id: receipt.id,
        notes: receipt.notes,
        receivedAt: dateToDateOnly(receipt.receivedAt),
        reference: receipt.reference,
      })),
      scheduledAmount: installment.scheduledAmount.toString(),
      sequence: installment.sequence,
    })),
    paymentTermsRaw: record.paymentTermsRaw,
    project: record.project,
    projectId: record.projectId,
    reference: record.reference,
    status: calculated.status,
    totalHt: record.totalHt.toString(),
    totalTtc: record.totalTtc.toString(),
    updatedAt: record.updatedAt.toISOString(),
    vatAmount: record.vatAmount.toString(),
    vatRate: record.vatRate?.toString() ?? null,
    vatTreatment: record.vatTreatment,
  };
}

export type ClientBillingView = ReturnType<typeof billingView>;

export interface BillingPageFilters extends PageInput {
  clientId?: string | undefined;
  currencyCode?: string | undefined;
  direction: "asc" | "desc";
  documentType?: ClientBillingDocumentType | undefined;
  projectId?: string | undefined;
  query: string;
  sort: "date" | "dueDate" | "reference" | "updated";
}

export async function listClientBillingPage(filters: BillingPageFilters) {
  const query = filters.query.trim();
  const where: Prisma.ClientBillingDocumentWhereInput = {
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.currencyCode ? { currencyCode: filters.currencyCode } : {}),
    ...(filters.documentType ? { documentType: filters.documentType } : {}),
    ...(query
      ? {
          OR: [
            { reference: { contains: query, mode: "insensitive" } },
            {
              client: { displayName: { contains: query, mode: "insensitive" } },
            },
            { project: { name: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const field =
    filters.sort === "date"
      ? "documentDate"
      : filters.sort === "dueDate"
        ? "dueDate"
        : filters.sort === "reference"
          ? "reference"
          : "updatedAt";
  const database = getDatabase();
  const [records, total] = await Promise.all([
    database.clientBillingDocument.findMany({
      where,
      include: billingInclude,
      orderBy: [{ [field]: filters.direction }, { id: "asc" }],
      skip: paginationSkip(filters),
      take: filters.pageSize,
    }),
    database.clientBillingDocument.count({ where }),
  ]);
  return { items: records.map((record) => billingView(record)), total };
}

export async function listClientBillingOptions() {
  const database = getDatabase();
  const [clients, projects, currencies, orders, installments] =
    await Promise.all([
      database.client.findMany({
        where: { isActive: true },
        orderBy: { displayName: "asc" },
        select: { displayName: true, id: true },
      }),
      database.project.findMany({
        where: { status: { not: "ARCHIVED" } },
        orderBy: { name: "asc" },
        select: {
          clientId: true,
          code: true,
          id: true,
          name: true,
          reportingCurrencyCode: true,
        },
      }),
      database.currency.findMany({
        where: { isActive: true },
        orderBy: { code: "asc" },
        select: { code: true, name: true },
      }),
      database.procurementOrder.findMany({
        where: { status: { not: "CANCELLED" } },
        orderBy: { orderNumber: "asc" },
        select: { id: true, orderNumber: true, projectId: true },
      }),
      database.clientPaymentInstallment.findMany({
        where: {
          billingDocument: { documentType: ClientBillingDocumentType.QUOTE },
          isCancelled: false,
        },
        orderBy: { dueDate: "asc" },
        select: {
          billingDocument: {
            select: {
              clientId: true,
              projectId: true,
              reference: true,
            },
          },
          currencyCode: true,
          dueDate: true,
          id: true,
          label: true,
          scheduledAmount: true,
        },
      }),
    ]);
  return {
    clients,
    currencies,
    installments: installments.map((installment) => ({
      ...installment,
      dueDate: dateToDateOnly(installment.dueDate),
      scheduledAmount: installment.scheduledAmount.toString(),
    })),
    orders,
    projects,
  };
}

async function assertRelations(input: ClientBillingConfirmation) {
  const database = getDatabase();
  const [project, currency, orders, installment] = await Promise.all([
    database.project.findFirst({
      where: { id: input.projectId, clientId: input.clientId },
      select: { id: true, reportingCurrencyCode: true },
    }),
    database.currency.findFirst({
      where: { code: input.currencyCode, isActive: true },
      select: { code: true },
    }),
    database.procurementOrder.findMany({
      where: {
        id: { in: input.allocations.map((allocation) => allocation.orderId) },
        projectId: input.projectId,
      },
      select: { id: true },
    }),
    input.matchedInstallmentId
      ? database.clientPaymentInstallment.findFirst({
          where: {
            id: input.matchedInstallmentId,
            billingDocument: {
              clientId: input.clientId,
              documentType: ClientBillingDocumentType.QUOTE,
              projectId: input.projectId,
            },
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (!project || !currency)
    throw new ClientBillingValidationError(
      "Choose a Client, one of that Client's Projects, and an active currency.",
    );
  if (
    orders.length !==
    new Set(input.allocations.map((item) => item.orderId)).size
  )
    throw new ClientBillingValidationError(
      "Every allocation must reference a unique Order in the selected Project.",
    );
  if (input.matchedInstallmentId && !installment)
    throw new ClientBillingValidationError(
      "The selected planned payment does not belong to this Client and Project.",
    );
  if (input.currencyCode !== project.reportingCurrencyCode && !input.fxRate) {
    throw new ClientBillingValidationError(
      "Enter the manual FX rate to the Project reporting currency.",
    );
  }
  if (!input.matchedInstallmentId) {
    const schedule = reconcileSchedule(
      input.totalTtc,
      input.installments.map((item) => ({
        paidAmount: "0",
        scheduledAmount: installmentAmount(item, input.totalTtc),
      })),
    );
    if (!schedule.overallocated.isZero()) {
      throw new ClientBillingValidationError(
        "The Client payment schedule cannot exceed the document total TTC.",
      );
    }
  }
  const allocation = allocationReconciliation(
    input.totalHt,
    input.allocations.map((item) => item.allocatedAmount),
  );
  if (!new Decimal(allocation.overallocated).isZero())
    throw new ClientBillingValidationError(
      "Order allocations cannot exceed the document total HT.",
    );
  if (
    input.allocations.length > 0 &&
    !new Decimal(allocation.remaining).isZero() &&
    !input.isProjectRemainderApproved
  ) {
    throw new ClientBillingValidationError(
      "Confirm that the unallocated remainder should remain at Project level.",
    );
  }
  return project;
}

function installmentAmount(
  installment: ClientBillingConfirmation["installments"][number],
  totalTtc: string,
) {
  return installment.basis === InstallmentBasis.PERCENTAGE
    ? scheduledAmountFromPercentage(
        totalTtc,
        installment.percentageRate ?? "0",
      ).toFixed(4)
    : (installment.fixedAmount ?? "0");
}

export async function confirmClientBillingDocument(
  actorId: string,
  input: ClientBillingConfirmation,
): Promise<string> {
  const project = await assertRelations(input);
  return getDatabase().$transaction(
    async (transaction) => {
      const data = {
        clientId: input.clientId,
        currencyCode: input.currencyCode,
        documentDate: dateOnlyToDate(input.documentDate),
        documentType: input.documentType,
        dueDate: input.dueDate ? dateOnlyToDate(input.dueDate) : null,
        fxRateToReporting:
          input.currencyCode === project.reportingCurrencyCode
            ? null
            : (input.fxRate ?? null),
        isCancelled: input.isCancelled,
        isProjectRemainderApproved: input.isProjectRemainderApproved,
        matchedInstallmentId:
          input.documentType === ClientBillingDocumentType.INVOICE
            ? (input.matchedInstallmentId ?? null)
            : null,
        notes: input.notes ?? null,
        paymentTermsRaw: input.paymentTermsRaw ?? null,
        projectId: input.projectId,
        reference: input.reference,
        totalHt: input.totalHt,
        totalTtc: input.totalTtc,
        updatedById: actorId,
        vatAmount: input.vatAmount,
        vatRate: input.vatRate ?? null,
        vatTreatment: input.vatTreatment ?? null,
      };
      const existing = input.existingDocumentId
        ? await transaction.clientBillingDocument.findUnique({
            where: { id: input.existingDocumentId },
            select: {
              clientId: true,
              documentType: true,
              id: true,
              projectId: true,
            },
          })
        : null;
      if (input.action === "UPDATE") {
        if (
          !existing ||
          existing.clientId !== input.clientId ||
          existing.projectId !== input.projectId ||
          existing.documentType !== input.documentType
        ) {
          throw new ClientBillingValidationError(
            "The selected billing document cannot be updated in this Client/Project flow.",
          );
        }
      }
      const document =
        input.action === "UPDATE" && existing
          ? await transaction.clientBillingDocument.update({
              where: { id: existing.id },
              data,
              select: { id: true },
            })
          : await transaction.clientBillingDocument.create({
              data: { ...data, createdById: actorId },
              select: { id: true },
            });
      const usesMatchedSchedule =
        input.documentType === ClientBillingDocumentType.INVOICE &&
        Boolean(input.matchedInstallmentId);
      if (
        input.action === "UPDATE" &&
        (input.replaceSchedule || usesMatchedSchedule)
      ) {
        const protectedInstallments =
          await transaction.clientPaymentInstallment.count({
            where: {
              billingDocumentId: document.id,
              OR: [
                { receipts: { some: {} } },
                { matchedInvoices: { some: {} } },
              ],
            },
          });
        if (protectedInstallments > 0)
          throw new ClientBillingValidationError(
            "A schedule with receipts or matched invoices cannot be replaced.",
          );
        await transaction.clientPaymentInstallment.deleteMany({
          where: { billingDocumentId: document.id },
        });
      }
      const installmentsToCreate = usesMatchedSchedule
        ? []
        : input.installments;
      if (
        installmentsToCreate.length > 0 &&
        (input.action === "CREATE" || input.replaceSchedule)
      ) {
        await transaction.clientPaymentInstallment.createMany({
          data: installmentsToCreate.map((installment, index) => ({
            basis: installment.basis,
            billingDocumentId: document.id,
            createdById: actorId,
            currencyCode: input.currencyCode,
            dueDate: dateOnlyToDate(installment.dueDate),
            expectedFxRateToReporting:
              input.currencyCode === project.reportingCurrencyCode
                ? null
                : (input.fxRate ?? null),
            label: installment.label,
            notes: installment.notes ?? null,
            percentageRate:
              installment.basis === InstallmentBasis.PERCENTAGE
                ? (installment.percentageRate ?? null)
                : null,
            scheduledAmount: installmentAmount(installment, input.totalTtc),
            sequence: index + 1,
            updatedById: actorId,
          })),
        });
      }
      await transaction.clientBillingAllocation.deleteMany({
        where: { billingDocumentId: document.id },
      });
      await transaction.clientBillingAllocation.createMany({
        data: input.allocations.map((allocation) => ({
          allocatedAmount: allocation.allocatedAmount,
          basis: allocation.basis,
          billingDocumentId: document.id,
          createdById: actorId,
          orderId: allocation.orderId,
          percentageRate:
            allocation.basis === ClientBillingAllocationBasis.PERCENTAGE
              ? (allocation.percentageRate ?? null)
              : null,
          updatedById: actorId,
        })),
      });
      await transaction.clientDocumentImport.create({
        data: {
          action:
            input.action === "UPDATE"
              ? ClientDocumentImportAction.UPDATED
              : ClientDocumentImportAction.CREATED,
          billingDocumentId: document.id,
          clientId: input.clientId,
          documentReference: input.reference,
          documentType: input.documentType,
          duplicateWarning: input.duplicateWarning,
          extractionModel: input.model,
          extractionProvider: input.provider,
          originalFilename: input.originalFilename,
          processedById: actorId,
          projectId: input.projectId,
        },
      });
      await writeAuditEvent(transaction, actorId, {
        action: input.action === "UPDATE" ? "UPDATED" : "CREATED",
        entityId: document.id,
        entityReference: input.reference,
        entityType: "BILLING_DOCUMENT",
        metadata: {
          allocationCount: input.allocations.length,
          documentType: input.documentType,
          installmentCount: installmentsToCreate.length,
          matchedInstallmentId: input.matchedInstallmentId ?? null,
        },
        summary: `${input.action === "UPDATE" ? "Updated" : "Created"} the reviewed Client ${input.documentType.toLowerCase()}.`,
      });
      return document.id;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function recordClientReceipt(
  actorId: string,
  input: ClientReceiptInput,
): Promise<void> {
  const installment = await getDatabase().clientPaymentInstallment.findUnique({
    where: { id: input.installmentId },
    include: {
      billingDocument: {
        select: {
          project: { select: { reportingCurrencyCode: true } },
          reference: true,
        },
      },
      receipts: { select: { amount: true } },
    },
  });
  if (!installment) throw new ClientBillingNotFoundError();
  const paid = installment.receipts.reduce(
    (sum, receipt) => sum.plus(receipt.amount),
    new Decimal(0),
  );
  if (paid.plus(input.amount).greaterThan(installment.scheduledAmount)) {
    throw new ClientBillingValidationError(
      "The receipt would exceed the scheduled amount.",
    );
  }
  if (
    installment.currencyCode !==
      installment.billingDocument.project.reportingCurrencyCode &&
    !input.fxRate
  ) {
    throw new ClientBillingValidationError(
      "Enter the actual receipt FX rate to Project reporting currency.",
    );
  }
  await getDatabase().$transaction(async (transaction) => {
    const receipt = await transaction.clientReceipt.create({
      data: {
        amount: input.amount,
        createdById: actorId,
        fxRateToReporting:
          installment.currencyCode ===
          installment.billingDocument.project.reportingCurrencyCode
            ? null
            : (input.fxRate ?? null),
        installmentId: input.installmentId,
        notes: input.notes ?? null,
        receivedAt: dateOnlyToDate(input.receivedAt),
        reference: input.reference ?? null,
        updatedById: actorId,
      },
    });
    await writeAuditEvent(transaction, actorId, {
      action: "CREATED",
      entityId: receipt.id,
      entityReference: `${installment.billingDocument.reference} · receipt`,
      entityType: "CLIENT_RECEIPT",
      metadata: { amount: input.amount, installmentId: input.installmentId },
      summary: "Recorded an actual Client receipt.",
    });
  });
}

export async function updateClientBillingInline(
  actorId: string,
  input: InlineClientBillingInput,
) {
  return getDatabase().$transaction(async (transaction) => {
    const existing = await transaction.clientBillingDocument.findUnique({
      where: { id: input.id },
      select: {
        isCancelled: true,
        matchedInstallment: {
          select: { _count: { select: { receipts: true } } },
        },
        paymentInstallments: {
          select: { _count: { select: { receipts: true } } },
        },
      },
    });
    if (!existing) throw new ClientBillingNotFoundError();
    const receiptCount =
      (existing.matchedInstallment?._count.receipts ?? 0) +
      existing.paymentInstallments.reduce(
        (total, installment) => total + installment._count.receipts,
        0,
      );
    if (!existing.isCancelled && input.isCancelled && receiptCount > 0) {
      throw new ClientBillingValidationError(
        "A billing document with recorded Client receipts cannot be cancelled.",
      );
    }
    const document = await transaction.clientBillingDocument.update({
      where: { id: input.id },
      data: {
        dueDate: input.dueDate ? dateOnlyToDate(input.dueDate) : null,
        isCancelled: input.isCancelled,
        notes: input.notes ?? null,
        reference: input.reference,
        updatedById: actorId,
      },
      select: { id: true, reference: true },
    });
    await writeAuditEvent(transaction, actorId, {
      action: "UPDATED",
      entityId: document.id,
      entityReference: document.reference,
      entityType: "BILLING_DOCUMENT",
      metadata: {
        changedFields: ["reference", "dueDate", "notes", "isCancelled"],
      },
      summary: "Updated safe Client billing fields.",
    });
    return document;
  });
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

export async function getProjectClientBillingSummary(projectId: string) {
  const project = await getDatabase().project.findUnique({
    where: { id: projectId },
    select: {
      billingDocuments: {
        where: { isCancelled: false },
        include: billingInclude,
      },
      reportingCurrencyCode: true,
    },
  });
  if (!project) return null;
  let quoted = new Decimal(0);
  let invoiced = new Decimal(0);
  let invoiceOutstanding = new Decimal(0);
  let paid = new Decimal(0);
  let overdue = new Decimal(0);
  const missingIds = new Set<string>();
  const uniqueReceipts = new Map<
    string,
    ReturnType<typeof receiptRecords>[number] & { currencyCode: string }
  >();
  for (const record of project.billingDocuments) {
    const convertedHt = converted(
      record.totalHt.toString(),
      record.currencyCode,
      project.reportingCurrencyCode,
      record.fxRateToReporting?.toString() ?? null,
    );
    if (convertedHt === null) missingIds.add(record.id);
    else if (record.documentType === ClientBillingDocumentType.QUOTE)
      quoted = quoted.plus(convertedHt);
    else invoiced = invoiced.plus(convertedHt);
    for (const receipt of receiptRecords(record)) {
      uniqueReceipts.set(receipt.id, {
        ...receipt,
        currencyCode: record.currencyCode,
      });
    }
    if (record.documentType === ClientBillingDocumentType.INVOICE) {
      const view = billingView(record);
      const outstanding = converted(
        view.outstanding,
        record.currencyCode,
        project.reportingCurrencyCode,
        record.fxRateToReporting?.toString() ?? null,
      );
      if (outstanding === null) missingIds.add(record.id);
      else {
        invoiceOutstanding = invoiceOutstanding.plus(outstanding);
        if (view.status === "OVERDUE") overdue = overdue.plus(outstanding);
      }
    }
  }
  for (const receipt of uniqueReceipts.values()) {
    const convertedReceipt = converted(
      receipt.amount.toString(),
      receipt.currencyCode,
      project.reportingCurrencyCode,
      receipt.fxRateToReporting?.toString() ?? null,
    );
    if (convertedReceipt === null) missingIds.add(receipt.id);
    else paid = paid.plus(convertedReceipt);
  }
  return {
    complete: missingIds.size === 0,
    invoicedHt: invoiced.toFixed(4),
    missingIds: [...missingIds],
    outstandingTtc: invoiceOutstanding.toFixed(4),
    overdueTtc: overdue.toFixed(4),
    paidTtc: paid.toFixed(4),
    quotedHt: quoted.toFixed(4),
    reportingCurrencyCode: project.reportingCurrencyCode,
  };
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
    include: billingInclude,
  });
  let invoiced = new Decimal(0);
  let outstanding = new Decimal(0);
  let overdue = new Decimal(0);
  const receipts = new Map<
    string,
    ReturnType<typeof receiptRecords>[number] & {
      currencyCode: string;
      reportingCurrencyCode: string;
    }
  >();
  const missingIds = new Set<string>();
  for (const record of records) {
    if (record.documentType === ClientBillingDocumentType.INVOICE) {
      const ht = converted(
        record.totalHt.toString(),
        record.currencyCode,
        record.project.reportingCurrencyCode,
        record.fxRateToReporting?.toString() ?? null,
      );
      const view = billingView(record);
      const remaining = converted(
        view.outstanding,
        record.currencyCode,
        record.project.reportingCurrencyCode,
        record.fxRateToReporting?.toString() ?? null,
      );
      if (ht === null || remaining === null) missingIds.add(record.id);
      else {
        invoiced = invoiced.plus(ht);
        outstanding = outstanding.plus(remaining);
        if (view.status === "OVERDUE") overdue = overdue.plus(remaining);
      }
    }
    for (const receipt of receiptRecords(record)) {
      receipts.set(receipt.id, {
        ...receipt,
        currencyCode: record.currencyCode,
        reportingCurrencyCode: record.project.reportingCurrencyCode,
      });
    }
  }
  let paid = new Decimal(0);
  for (const receipt of receipts.values()) {
    const amount = converted(
      receipt.amount.toString(),
      receipt.currencyCode,
      receipt.reportingCurrencyCode,
      receipt.fxRateToReporting?.toString() ?? null,
    );
    if (amount === null) missingIds.add(receipt.id);
    else paid = paid.plus(amount);
  }
  return {
    complete: missingIds.size === 0,
    currencyCode: COMPANY_REPORTING_CURRENCY_CODE,
    invoicedHt: invoiced.toFixed(4),
    outstandingTtc: outstanding.toFixed(4),
    overdueTtc: overdue.toFixed(4),
    paidTtc: paid.toFixed(4),
  };
}

export async function getOrderBillingAllocations(orderIds: readonly string[]) {
  if (!orderIds.length)
    return new Map<string, { invoiced: string; quoted: string }>();
  const allocations = await getDatabase().clientBillingAllocation.findMany({
    where: {
      orderId: { in: [...orderIds] },
      billingDocument: { isCancelled: false },
    },
    select: {
      allocatedAmount: true,
      billingDocument: {
        select: {
          currencyCode: true,
          documentType: true,
          fxRateToReporting: true,
          project: { select: { reportingCurrencyCode: true } },
        },
      },
      orderId: true,
    },
  });
  const result = new Map<string, { invoiced: Decimal; quoted: Decimal }>();
  for (const allocation of allocations) {
    const document = allocation.billingDocument;
    const amount = converted(
      allocation.allocatedAmount.toString(),
      document.currencyCode,
      document.project.reportingCurrencyCode,
      document.fxRateToReporting?.toString() ?? null,
    );
    if (amount === null) continue;
    const current = result.get(allocation.orderId) ?? {
      invoiced: new Decimal(0),
      quoted: new Decimal(0),
    };
    if (document.documentType === ClientBillingDocumentType.INVOICE)
      current.invoiced = current.invoiced.plus(amount);
    else current.quoted = current.quoted.plus(amount);
    result.set(allocation.orderId, current);
  }
  return new Map(
    [...result].map(([id, value]) => [
      id,
      { invoiced: value.invoiced.toFixed(4), quoted: value.quoted.toFixed(4) },
    ]),
  );
}
