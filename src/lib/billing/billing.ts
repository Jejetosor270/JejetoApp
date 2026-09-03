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
  isRecognizedClientReceivable,
  orderSellingBasisInBillingCurrency,
} from "@/domain/billing/calculations";
import type {
  BillingAllocationInput,
  BillingAllocationsEditInput,
  BillingDocumentEditInput,
  ClientBillingInstallmentUpdateInput,
  ClientBillingConfirmation,
  ClientReceiptInput,
  InlineClientBillingInput,
  OrderBillingLinkInput,
} from "@/domain/billing/validation";
import { reportingAmount } from "@/domain/finance/calculations";
import {
  installmentOutstanding,
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
import { getOrder, getOrderInTransaction } from "@/lib/procurement/orders";

export class ClientBillingValidationError extends Error {}
export class ClientBillingNotFoundError extends Error {}

const billingInclude = {
  allocations: {
    include: {
      order: {
        select: {
          orderNumber: true,
          supplier: { select: { displayName: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  },
  client: { select: { displayName: true, id: true } },
  matchedInstallment: {
    include: {
      billingDocument: { select: { reference: true, totalTtc: true } },
      receipts: { orderBy: { receivedAt: "asc" } },
    },
  },
  paymentInstallments: {
    include: {
      billingDocument: { select: { reference: true, totalTtc: true } },
      receipts: { orderBy: { receivedAt: "asc" } },
    },
    orderBy: { sequence: "asc" },
  },
  project: {
    select: { id: true, name: true, reportingCurrencyCode: true },
  },
  imports: {
    include: {
      processedBy: { select: { name: true } },
    },
    orderBy: { processedAt: "desc" },
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
      supplierName: allocation.order.supplier.displayName,
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
    imports: record.imports.map((item) => ({
      action: item.action,
      duplicateWarning: item.duplicateWarning,
      extractionModel: item.extractionModel,
      extractionProvider: item.extractionProvider,
      id: item.id,
      originalFilename: item.originalFilename,
      processedAt: item.processedAt.toISOString(),
      processedByName: item.processedBy?.name ?? null,
    })),
    matchedInstallmentId: record.matchedInstallmentId,
    notes: record.notes,
    outstanding: calculated.outstanding,
    paid: calculated.paid,
    paymentInstallments: visibleInstallments.map((installment) => ({
      basis: installment.basis,
      billingDocumentId: installment.billingDocumentId,
      billingReference: installment.billingDocument.reference,
      billingTotalTtc: installment.billingDocument.totalTtc.toString(),
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

export async function getClientBillingDocument(documentId: string) {
  const record = await getDatabase().clientBillingDocument.findUnique({
    where: { id: documentId },
    include: billingInclude,
  });
  return record ? billingView(record) : null;
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
        select: {
          id: true,
          orderNumber: true,
          projectId: true,
          supplier: { select: { displayName: true } },
        },
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

export async function updateClientBillingInstallment(
  actorId: string,
  input: ClientBillingInstallmentUpdateInput,
) {
  return getDatabase().$transaction(async (transaction) => {
    const current = await transaction.clientPaymentInstallment.findUnique({
      where: { id: input.id },
      include: {
        billingDocument: {
          select: { id: true, reference: true, totalTtc: true },
        },
        matchedInvoices: { select: { id: true } },
        receipts: { select: { amount: true } },
      },
    });
    if (!current) throw new ClientBillingNotFoundError();
    const belongsToView =
      current.billingDocumentId === input.billingDocumentId ||
      current.matchedInvoices.some(
        (document) => document.id === input.billingDocumentId,
      );
    if (!belongsToView)
      throw new ClientBillingValidationError(
        "This installment does not belong to the selected Billing Event.",
      );

    const amount =
      input.basis === InstallmentBasis.PERCENTAGE
        ? scheduledAmountFromPercentage(
            current.billingDocument.totalTtc,
            input.percentageRate ?? "0",
          )
        : new Decimal(input.scheduledAmount);
    const settled = current.receipts.reduce(
      (total, receipt) => total.plus(receipt.amount),
      new Decimal(0),
    );
    if (amount.lessThan(settled))
      throw new ClientBillingValidationError(
        "Scheduled amount cannot be reduced below the amount already received.",
      );

    const otherScheduled = await transaction.clientPaymentInstallment.aggregate(
      {
        where: {
          billingDocumentId: current.billingDocumentId,
          id: { not: current.id },
          isCancelled: false,
        },
        _sum: { scheduledAmount: true },
      },
    );
    if (
      new Decimal(otherScheduled._sum.scheduledAmount?.toString() ?? "0")
        .plus(amount)
        .greaterThan(current.billingDocument.totalTtc)
    )
      throw new ClientBillingValidationError(
        "The Client payment schedule cannot exceed the Billing TTC.",
      );

    const installment = await transaction.clientPaymentInstallment.update({
      where: { id: current.id },
      data: {
        basis: input.basis,
        dueDate: dateOnlyToDate(input.dueDate),
        label: input.label,
        notes: input.notes ?? null,
        percentageRate:
          input.basis === InstallmentBasis.PERCENTAGE
            ? (input.percentageRate ?? "0")
            : null,
        scheduledAmount: amount.toFixed(4),
        updatedById: actorId,
      },
      select: {
        basis: true,
        dueDate: true,
        label: true,
        notes: true,
        percentageRate: true,
        scheduledAmount: true,
      },
    });
    await writeAuditEvent(transaction, actorId, {
      action: "UPDATED",
      entityId: current.id,
      entityReference: `${current.billingDocument.reference} · ${installment.label}`,
      entityType: "INSTALLMENT",
      metadata: {
        fields: [
          "basis",
          "percentageRate",
          "scheduledAmount",
          "dueDate",
          "label",
          "notes",
        ],
      },
      summary: "Updated a Client Billing payment installment.",
    });
    return {
      basis: installment.basis,
      dueDate: dateToDateOnly(installment.dueDate),
      label: installment.label,
      notes: installment.notes ?? "",
      percentageRate: installment.percentageRate?.toString() ?? "",
      scheduledAmount: installment.scheduledAmount.toString(),
    };
  });
}

interface AllocationDocumentContext {
  id: string;
  isProjectRemainderApproved: boolean;
  projectId: string;
  reference: string;
  totalHt: string;
}

interface ExistingAllocationRecord {
  allocatedAmount: { toString(): string };
  basis: ClientBillingAllocationBasis;
  id: string;
  orderId: string;
  percentageRate: { toString(): string } | null;
}

async function validateBillingAllocations(
  transaction: Prisma.TransactionClient,
  document: AllocationDocumentContext,
  allocations: readonly BillingAllocationInput[],
  isProjectRemainderApproved: boolean,
) {
  if (
    new Set(allocations.map((item) => item.orderId)).size !== allocations.length
  )
    throw new ClientBillingValidationError(
      "Each Order can appear only once in a Billing Event.",
    );
  const matchingOrders = await transaction.procurementOrder.count({
    where: {
      id: { in: allocations.map((item) => item.orderId) },
      projectId: document.projectId,
    },
  });
  if (matchingOrders !== allocations.length)
    throw new ClientBillingValidationError(
      "Every allocation must reference an Order in the Billing Event Project.",
    );
  for (const allocation of allocations) {
    if (
      allocation.basis === ClientBillingAllocationBasis.PERCENTAGE &&
      allocation.percentageRate
    ) {
      const expected = scheduledAmountFromPercentage(
        document.totalHt,
        allocation.percentageRate,
      ).toFixed(4);
      if (!new Decimal(expected).equals(allocation.allocatedAmount))
        throw new ClientBillingValidationError(
          "A percentage allocation amount must match the Billing HT percentage.",
        );
    }
  }
  const reconciliation = allocationReconciliation(
    document.totalHt,
    allocations.map((item) => item.allocatedAmount),
  );
  if (!new Decimal(reconciliation.overallocated).isZero())
    throw new ClientBillingValidationError(
      "Order allocations cannot exceed the Billing Event total HT.",
    );
  if (
    !new Decimal(reconciliation.remaining).isZero() &&
    !isProjectRemainderApproved
  )
    throw new ClientBillingValidationError(
      "Confirm that the unallocated remainder should remain at Project level.",
    );
  return reconciliation;
}

async function reconcileBillingAllocationsInTransaction(
  transaction: Prisma.TransactionClient,
  actorId: string,
  document: AllocationDocumentContext,
  existing: readonly ExistingAllocationRecord[],
  input: BillingAllocationsEditInput,
) {
  await validateBillingAllocations(
    transaction,
    document,
    input.allocations,
    input.isProjectRemainderApproved,
  );
  const currentByOrder = new Map(existing.map((item) => [item.orderId, item]));
  const nextByOrder = new Map(
    input.allocations.map((item) => [item.orderId, item]),
  );
  const removed = existing.filter((item) => !nextByOrder.has(item.orderId));
  const added = input.allocations.filter(
    (item) => !currentByOrder.has(item.orderId),
  );
  const changed = input.allocations.filter((item) => {
    const current = currentByOrder.get(item.orderId);
    return (
      current !== undefined &&
      (current.basis !== item.basis ||
        !new Decimal(current.allocatedAmount.toString()).equals(
          item.allocatedAmount,
        ) ||
        (current.percentageRate?.toString() ?? null) !==
          (item.percentageRate ?? null))
    );
  });
  if (removed.length)
    await transaction.clientBillingAllocation.deleteMany({
      where: { id: { in: removed.map((item) => item.id) } },
    });
  for (const allocation of changed) {
    const current = currentByOrder.get(allocation.orderId);
    if (!current) continue;
    await transaction.clientBillingAllocation.update({
      where: { id: current.id },
      data: {
        allocatedAmount: allocation.allocatedAmount,
        basis: allocation.basis,
        percentageRate:
          allocation.basis === ClientBillingAllocationBasis.PERCENTAGE
            ? (allocation.percentageRate ?? null)
            : null,
        updatedById: actorId,
      },
    });
  }
  if (added.length)
    await transaction.clientBillingAllocation.createMany({
      data: added.map((allocation) => ({
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
  const remainderApprovalChanged =
    document.isProjectRemainderApproved !== input.isProjectRemainderApproved;
  if (remainderApprovalChanged)
    await transaction.clientBillingDocument.update({
      where: { id: document.id },
      data: {
        isProjectRemainderApproved: input.isProjectRemainderApproved,
        updatedById: actorId,
      },
    });
  if (
    added.length ||
    changed.length ||
    removed.length ||
    remainderApprovalChanged
  )
    await writeAuditEvent(transaction, actorId, {
      action: "UPDATED",
      entityId: document.id,
      entityReference: document.reference,
      entityType: "BILLING_DOCUMENT",
      metadata: {
        allocationAddedOrderIds: added.map((item) => item.orderId),
        allocationChangedOrderIds: changed.map((item) => item.orderId),
        allocationRemovedOrderIds: removed.map((item) => item.orderId),
        projectRemainderApproved: input.isProjectRemainderApproved,
        projectRemainderApprovalChanged: remainderApprovalChanged,
      },
      summary: "Reconciled Client Billing allocations with Procurement Orders.",
    });
}

export async function updateClientBillingAllocations(
  actorId: string,
  input: BillingAllocationsEditInput,
) {
  return getDatabase().$transaction(
    async (transaction) => {
      const document = await transaction.clientBillingDocument.findUnique({
        where: { id: input.billingDocumentId },
        select: {
          allocations: true,
          id: true,
          isProjectRemainderApproved: true,
          projectId: true,
          reference: true,
          totalHt: true,
        },
      });
      if (!document) throw new ClientBillingNotFoundError();
      await reconcileBillingAllocationsInTransaction(
        transaction,
        actorId,
        { ...document, totalHt: document.totalHt.toString() },
        document.allocations,
        input,
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateOrderBillingLinkInTransaction(
  transaction: Prisma.TransactionClient,
  actorId: string,
  input: OrderBillingLinkInput,
) {
  const [document, order] = await Promise.all([
    transaction.clientBillingDocument.findUnique({
      where: { id: input.billingDocumentId },
      select: {
        allocations: true,
        currencyCode: true,
        fxRateToReporting: true,
        id: true,
        isCancelled: true,
        isProjectRemainderApproved: true,
        projectId: true,
        reference: true,
        totalHt: true,
      },
    }),
    getOrderInTransaction(transaction, input.orderId),
  ]);
  if (!document) throw new ClientBillingNotFoundError();
  if (!order)
    throw new ClientBillingValidationError(
      "The selected Order no longer exists.",
    );
  if (order.project.id !== document.projectId)
    throw new ClientBillingValidationError(
      "The selected Order must belong to the Billing Event Project.",
    );
  if (!input.remove && document.isCancelled)
    throw new ClientBillingValidationError(
      "A cancelled Billing Event cannot receive a new Order allocation.",
    );
  const allocations: BillingAllocationInput[] = document.allocations
    .filter((item) => item.orderId !== input.orderId)
    .map((item) => ({
      allocatedAmount: item.allocatedAmount.toString(),
      basis: item.basis,
      orderId: item.orderId,
      ...(item.percentageRate
        ? { percentageRate: item.percentageRate.toString() }
        : {}),
    }));
  if (
    !input.remove &&
    input.basis &&
    (input.allocatedAmount || input.percentageRate !== undefined)
  ) {
    const orderBasis = orderSellingBasisInBillingCurrency({
      billingCurrencyCode: document.currencyCode,
      billingFxRateToReporting: document.fxRateToReporting?.toString() ?? null,
      orderSellingReporting: order.costs.reportingSellingRevenue,
      reportingCurrencyCode: order.project.reportingCurrencyCode,
    });
    if (orderBasis === null)
      throw new ClientBillingValidationError(
        "The Order selling amount is incomplete because a required FX rate is missing.",
      );
    const allocatedAmount =
      input.basis === ClientBillingAllocationBasis.PERCENTAGE
        ? new Decimal(orderBasis)
            .times(input.percentageRate ?? "0")
            .toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
            .toFixed(4)
        : (input.allocatedAmount ?? "0");
    const allocatedToOtherOrders = document.allocations
      .filter((item) => item.orderId !== input.orderId)
      .reduce(
        (total, allocation) => total.plus(allocation.allocatedAmount),
        new Decimal(0),
      );
    const available = Decimal.max(
      new Decimal(document.totalHt).minus(allocatedToOtherOrders),
      0,
    );
    if (new Decimal(allocatedAmount).greaterThan(available))
      throw new ClientBillingValidationError(
        "Allocation exceeds the remaining Billing Event amount.",
      );
    allocations.push({
      allocatedAmount,
      basis: ClientBillingAllocationBasis.FIXED_AMOUNT,
      orderId: input.orderId,
    });
  }
  await reconcileBillingAllocationsInTransaction(
    transaction,
    actorId,
    { ...document, totalHt: document.totalHt.toString() },
    document.allocations,
    {
      allocations,
      billingDocumentId: document.id,
      isProjectRemainderApproved: input.isProjectRemainderApproved,
    },
  );
}

export async function updateOrderBillingLink(
  actorId: string,
  input: OrderBillingLinkInput,
) {
  return getDatabase().$transaction(
    (transaction) =>
      updateOrderBillingLinkInTransaction(transaction, actorId, input),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateClientBillingDocument(
  actorId: string,
  input: BillingDocumentEditInput,
) {
  return getDatabase().$transaction(
    async (transaction) => {
      const existing = await transaction.clientBillingDocument.findUnique({
        where: { id: input.id },
        select: {
          allocations: true,
          clientId: true,
          currencyCode: true,
          id: true,
          isCancelled: true,
          isProjectRemainderApproved: true,
          matchedInstallment: {
            select: { receipts: { select: { amount: true } } },
          },
          matchedInstallmentId: true,
          paymentInstallments: {
            select: {
              scheduledAmount: true,
              receipts: { select: { amount: true } },
            },
          },
          projectId: true,
          reference: true,
        },
      });
      if (!existing) throw new ClientBillingNotFoundError();
      const [project, currency] = await Promise.all([
        transaction.project.findFirst({
          where: { clientId: input.clientId, id: input.projectId },
          select: { id: true, reportingCurrencyCode: true },
        }),
        transaction.currency.findFirst({
          where: { code: input.currencyCode, isActive: true },
          select: { code: true },
        }),
      ]);
      if (!project || !currency)
        throw new ClientBillingValidationError(
          "Choose a Client, one of that Client's Projects, and an active currency.",
        );
      const receipts = [
        ...existing.paymentInstallments.flatMap(
          (installment) => installment.receipts,
        ),
        ...(existing.matchedInstallment?.receipts ?? []),
      ];
      const relationshipChanged =
        existing.clientId !== input.clientId ||
        existing.projectId !== input.projectId;
      if (
        relationshipChanged &&
        (existing.allocations.length > 0 ||
          existing.paymentInstallments.length > 0 ||
          existing.matchedInstallmentId !== null ||
          receipts.length > 0)
      )
        throw new ClientBillingValidationError(
          "Reconcile Order allocations and payment activity before changing the Billing Client or Project.",
        );
      if (
        existing.currencyCode !== input.currencyCode &&
        (existing.paymentInstallments.length > 0 ||
          existing.matchedInstallmentId !== null)
      )
        throw new ClientBillingValidationError(
          "A Billing currency cannot change while a payment schedule is attached.",
        );
      if (input.currencyCode !== project.reportingCurrencyCode && !input.fxRate)
        throw new ClientBillingValidationError(
          "Enter the manual FX rate to the Project reporting currency.",
        );
      if (!existing.isCancelled && input.isCancelled && receipts.length > 0)
        throw new ClientBillingValidationError(
          "A Billing Event with recorded Client receipts cannot be cancelled.",
        );
      const paid = receipts.reduce(
        (total, receipt) => total.plus(receipt.amount),
        new Decimal(0),
      );
      if (paid.greaterThan(input.totalTtc))
        throw new ClientBillingValidationError(
          "Billing TTC cannot be reduced below the Client receipts already recorded.",
        );
      const scheduled = existing.paymentInstallments.reduce(
        (total, installment) => total.plus(installment.scheduledAmount),
        new Decimal(0),
      );
      if (scheduled.greaterThan(input.totalTtc))
        throw new ClientBillingValidationError(
          "The current payment schedule exceeds the edited Billing TTC.",
        );
      const allocationInput: BillingAllocationsEditInput = {
        allocations: input.allocations,
        billingDocumentId: input.id,
        isProjectRemainderApproved: input.isProjectRemainderApproved,
      };
      const allocationDocument = {
        id: existing.id,
        isProjectRemainderApproved: existing.isProjectRemainderApproved,
        projectId: input.projectId,
        reference: input.reference,
        totalHt: input.totalHt,
      };
      await validateBillingAllocations(
        transaction,
        allocationDocument,
        input.allocations,
        input.isProjectRemainderApproved,
      );
      await transaction.clientBillingDocument.update({
        where: { id: input.id },
        data: {
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
          notes: input.notes ?? null,
          projectId: input.projectId,
          reference: input.reference,
          totalHt: input.totalHt,
          totalTtc: input.totalTtc,
          updatedById: actorId,
          vatAmount: input.vatAmount,
          vatRate: input.vatRate ?? null,
          vatTreatment: input.vatTreatment ?? null,
        },
      });
      await writeAuditEvent(transaction, actorId, {
        action: "UPDATED",
        entityId: input.id,
        entityReference: input.reference,
        entityType: "BILLING_DOCUMENT",
        metadata: {
          changedFields: [
            "client",
            "project",
            "documentType",
            "reference",
            "documentDate",
            "dueDate",
            "currency",
            "fxRate",
            "totalHt",
            "vat",
            "totalTtc",
            "notes",
            "isCancelled",
          ],
        },
        summary: "Updated the Client Billing Event.",
      });
      await reconcileBillingAllocationsInTransaction(
        transaction,
        actorId,
        allocationDocument,
        existing.allocations,
        allocationInput,
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
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

function summarizeClientBillingRecords(
  records: readonly BillingRecord[],
  reportingCurrencyCode: string,
) {
  let quoted = new Decimal(0);
  let invoiced = new Decimal(0);
  let invoicedTtc = new Decimal(0);
  let invoiceOutstanding = new Decimal(0);
  let paid = new Decimal(0);
  let overdue = new Decimal(0);
  let upcomingScheduled = new Decimal(0);
  let nextDueDate: string | null = null;
  let scheduleComplete = true;
  const today = businessToday();
  const missingIds = new Set<string>();
  const uniqueReceipts = new Map<
    string,
    ReturnType<typeof receiptRecords>[number] & { currencyCode: string }
  >();
  const uniqueInstallments = new Map<
    string,
    BillingRecord["paymentInstallments"][number]
  >();
  for (const record of records) {
    const convertedHt = converted(
      record.totalHt.toString(),
      record.currencyCode,
      reportingCurrencyCode,
      record.fxRateToReporting?.toString() ?? null,
    );
    if (convertedHt === null) missingIds.add(record.id);
    else if (record.documentType === ClientBillingDocumentType.QUOTE)
      quoted = quoted.plus(convertedHt);
    else invoiced = invoiced.plus(convertedHt);
    if (record.documentType === ClientBillingDocumentType.INVOICE) {
      const convertedTtc = converted(
        record.totalTtc.toString(),
        record.currencyCode,
        reportingCurrencyCode,
        record.fxRateToReporting?.toString() ?? null,
      );
      if (convertedTtc === null) missingIds.add(record.id);
      else invoicedTtc = invoicedTtc.plus(convertedTtc);
    }
    for (const receipt of receiptRecords(record)) {
      uniqueReceipts.set(receipt.id, {
        ...receipt,
        currencyCode: record.currencyCode,
      });
    }
    const visibleInstallments = record.matchedInstallment
      ? [record.matchedInstallment]
      : record.paymentInstallments;
    for (const installment of visibleInstallments) {
      uniqueInstallments.set(installment.id, installment);
    }
    if (
      isRecognizedClientReceivable({
        documentType: record.documentType,
        isCancelled: record.isCancelled,
      })
    ) {
      const view = calculateClientBillingAmounts({
        documentType: record.documentType,
        dueDate: record.dueDate ? dateToDateOnly(record.dueDate) : null,
        isCancelled: record.isCancelled,
        paidAmounts: receiptRecords(record).map((receipt) =>
          receipt.amount.toString(),
        ),
        today,
        totalTtc: record.totalTtc.toString(),
      });
      const outstanding = converted(
        view.outstanding,
        record.currencyCode,
        reportingCurrencyCode,
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
      reportingCurrencyCode,
      receipt.fxRateToReporting?.toString() ?? null,
    );
    if (convertedReceipt === null) missingIds.add(receipt.id);
    else paid = paid.plus(convertedReceipt);
  }
  for (const installment of uniqueInstallments.values()) {
    if (installment.isCancelled) continue;
    const received = installment.receipts.reduce(
      (total, receipt) => total.plus(receipt.amount),
      new Decimal(0),
    );
    const outstanding = installmentOutstanding(
      installment.scheduledAmount,
      received,
    );
    const dueDate = dateToDateOnly(installment.dueDate);
    if (outstanding.isZero() || dueDate < today) continue;
    nextDueDate = earlierDate(nextDueDate, dueDate);
    const convertedOutstanding = converted(
      outstanding.toString(),
      installment.currencyCode,
      reportingCurrencyCode,
      installment.expectedFxRateToReporting?.toString() ?? null,
    );
    if (convertedOutstanding === null) scheduleComplete = false;
    else upcomingScheduled = upcomingScheduled.plus(convertedOutstanding);
  }
  return {
    complete: missingIds.size === 0,
    invoicedHt: invoiced.toFixed(4),
    invoicedTtc: invoicedTtc.toFixed(4),
    missingIds: [...missingIds],
    nextDueDate,
    outstandingTtc: invoiceOutstanding.toFixed(4),
    overdueTtc: overdue.toFixed(4),
    paidTtc: paid.toFixed(4),
    quotedHt: quoted.toFixed(4),
    reportingCurrencyCode,
    scheduleComplete,
    upcomingScheduledTtc: scheduleComplete
      ? upcomingScheduled.toFixed(4)
      : null,
  };
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
  return project
    ? summarizeClientBillingRecords(
        project.billingDocuments,
        project.reportingCurrencyCode,
      )
    : null;
}

export async function getProjectsClientBillingSummaries(
  projects: readonly { id: string; reportingCurrencyCode: string }[],
) {
  if (projects.length === 0)
    return new Map<string, ReturnType<typeof summarizeClientBillingRecords>>();
  const records = await getDatabase().clientBillingDocument.findMany({
    where: {
      isCancelled: false,
      projectId: { in: projects.map((project) => project.id) },
    },
    include: billingInclude,
  });
  const recordsByProject = new Map<string, BillingRecord[]>();
  for (const record of records) {
    const projectRecords = recordsByProject.get(record.projectId) ?? [];
    projectRecords.push(record);
    recordsByProject.set(record.projectId, projectRecords);
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
    include: billingInclude,
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

export async function getOrderBillingReconciliation(orderId: string) {
  const database = getDatabase();
  const order = await getOrder(orderId);
  if (!order) return null;
  const records = await database.clientBillingDocument.findMany({
    where: {
      projectId: order.project.id,
      OR: [{ isCancelled: false }, { allocations: { some: { orderId } } }],
    },
    include: billingInclude,
    orderBy: [{ documentDate: "desc" }, { reference: "asc" }],
  });
  return records.map((record) => {
    const view = billingView(record);
    const allocation = view.allocations.find(
      (item) => item.orderId === orderId,
    );
    const allocatedToOtherOrders = view.allocations
      .filter((item) => item.orderId !== orderId)
      .reduce(
        (total, item) => total.plus(item.allocatedAmount),
        new Decimal(0),
      );
    return {
      allocation: allocation
        ? {
            allocatedAmount: allocation.allocatedAmount,
            basis: allocation.basis,
            percentageRate: allocation.percentageRate,
          }
        : null,
      currencyCode: view.currencyCode,
      documentDate: view.documentDate,
      documentType: view.documentType,
      id: view.id,
      isCancelled: view.isCancelled,
      isProjectRemainderApproved: view.isProjectRemainderApproved,
      allocatedToOtherOrdersHt: allocatedToOtherOrders.toFixed(4),
      availableForOrderHt: Decimal.max(
        new Decimal(view.totalHt).minus(allocatedToOtherOrders),
        0,
      ).toFixed(4),
      orderSellingBasisHt: orderSellingBasisInBillingCurrency({
        billingCurrencyCode: view.currencyCode,
        billingFxRateToReporting: view.fxRate,
        orderSellingReporting: order.costs.reportingSellingRevenue,
        reportingCurrencyCode: order.project.reportingCurrencyCode,
      }),
      projectRemainder: view.allocationReconciliation.remaining,
      reference: view.reference,
      status: view.status,
      totalHt: view.totalHt,
    };
  });
}
