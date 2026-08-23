import "server-only";

import Decimal from "decimal.js";

import {
  InstallmentBasis,
  PaymentDirection,
  Prisma,
} from "@/generated/prisma/client";
import {
  aggregateReportingCash,
  clientReceivableBase,
  derivePaymentStatus,
  impliedPercentage,
  installmentOutstanding,
  reconcileSchedule,
  scheduledAmountFromPercentage,
  supplierPayableBase,
  type DerivedPaymentStatus,
} from "@/domain/payments/calculations";
import {
  buildCalendarEvents,
  type ProcurementCalendarEvent,
} from "@/domain/payments/calendar";
import {
  addMonthsToDateOnly,
  businessToday,
  dateOnlyToDate,
  dateToDateOnly,
} from "@/domain/payments/dates";
import { paymentSchedulePresets } from "@/domain/payments/presets";
import type {
  CreateInstallmentInput,
  SettlementInput,
  UpdateInstallmentInput,
} from "@/domain/payments/validation";
import { getDatabase } from "@/lib/db";
import { getOrder, type OrderSummary } from "@/lib/procurement/orders";

import { PaymentNotFoundError, PaymentValidationError } from "./errors";

const installmentInclude = {
  order: {
    select: {
      id: true,
      orderCurrencyCode: true,
      orderNumber: true,
      packageName: true,
      project: {
        select: {
          client: { select: { displayName: true, id: true } },
          id: true,
          name: true,
          reportingCurrencyCode: true,
        },
      },
      sellingCurrencyCode: true,
      supplier: { select: { displayName: true, id: true } },
    },
  },
  settlements: { orderBy: [{ settledAt: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.PaymentInstallmentInclude;
type InstallmentRecord = Prisma.PaymentInstallmentGetPayload<{
  include: typeof installmentInclude;
}>;

export interface PaymentSettlementView {
  amount: string;
  fxRate: string | null;
  id: string;
  notes: string | null;
  reference: string | null;
  settledAt: string;
}

export interface PaymentInstallmentView {
  actualDate: string | null;
  basis: InstallmentBasis;
  clientName: string;
  currencyCode: string;
  direction: PaymentDirection;
  dueDate: string;
  expectedFxRate: string | null;
  id: string;
  impliedPercentageRate: string | null;
  isCancelled: boolean;
  label: string;
  notes: string | null;
  orderId: string;
  orderNumber: string;
  outstandingAmount: string;
  paidAmount: string;
  packageName: string;
  percentageRate: string | null;
  projectId: string;
  projectName: string;
  reportingCurrencyCode: string;
  scheduledAmount: string;
  sequence: number;
  settlements: PaymentSettlementView[];
  status: DerivedPaymentStatus;
  supplierName: string;
}

export interface DirectionScheduleSummary {
  baseAmount: string;
  baseCurrencyCode: string;
  foreignCurrencyInstallmentCount: number;
  installments: PaymentInstallmentView[];
  overallocated: string;
  paid: string;
  reconciliationComplete: boolean;
  remainingTotal: string;
  scheduled: string;
  scheduledOutstanding: string;
  unscheduled: string;
}

export interface OrderPaymentSummary {
  client: DirectionScheduleSummary;
  orderId: string;
  supplier: DirectionScheduleSummary;
}

function paymentBase(
  order: OrderSummary,
  direction: PaymentDirection,
): { amount: Decimal; currencyCode: string; expectedFxRate: string | null } {
  if (direction === PaymentDirection.SUPPLIER_PAYMENT) {
    return {
      amount: supplierPayableBase({
        inputVatAmount: order.costs.inputVat?.amount,
        inputVatTreatment: order.costs.inputVat?.treatment,
        supplierPurchase: order.costs.purchaseCost ?? "0",
      }),
      currencyCode: order.orderCurrencyCode,
      expectedFxRate: order.costs.purchaseFxRate,
    };
  }
  return {
    amount: clientReceivableBase({
      outputVatAmount: order.costs.outputVat?.amount,
      sellingRevenue: order.totalSellingRevenue ?? "0",
    }),
    currencyCode: order.sellingCurrencyCode,
    expectedFxRate: order.costs.sellingFxRate,
  };
}

function paidAmount(record: InstallmentRecord): Decimal {
  return record.settlements.reduce(
    (total, settlement) => total.plus(settlement.amount),
    new Decimal(0),
  );
}

function installmentView(
  record: InstallmentRecord,
  baseAmount: Decimal | null,
  today: string,
): PaymentInstallmentView {
  const paid = paidAmount(record);
  const scheduled = new Decimal(record.scheduledAmount);
  const outstanding = record.isCancelled
    ? new Decimal(0)
    : installmentOutstanding(scheduled, paid);
  const lastSettlement = record.settlements.at(-1);
  return {
    actualDate: lastSettlement
      ? dateToDateOnly(lastSettlement.settledAt)
      : null,
    basis: record.basis,
    clientName: record.order.project.client.displayName,
    currencyCode: record.currencyCode,
    direction: record.direction,
    dueDate: dateToDateOnly(record.dueDate),
    expectedFxRate: record.expectedFxRateToReporting?.toString() ?? null,
    id: record.id,
    impliedPercentageRate: baseAmount
      ? (impliedPercentage(scheduled, baseAmount)?.toString() ?? null)
      : null,
    isCancelled: record.isCancelled,
    label: record.label,
    notes: record.notes,
    orderId: record.orderId,
    orderNumber: record.order.orderNumber,
    outstandingAmount: outstanding.toString(),
    packageName: record.order.packageName,
    paidAmount: paid.toString(),
    percentageRate: record.percentageRate?.toString() ?? null,
    projectId: record.order.project.id,
    projectName: record.order.project.name,
    reportingCurrencyCode: record.order.project.reportingCurrencyCode,
    scheduledAmount: scheduled.toString(),
    sequence: record.sequence,
    settlements: record.settlements.map((settlement) => ({
      amount: settlement.amount.toString(),
      fxRate: settlement.fxRateToReporting?.toString() ?? null,
      id: settlement.id,
      notes: settlement.notes,
      reference: settlement.reference,
      settledAt: dateToDateOnly(settlement.settledAt),
    })),
    status: derivePaymentStatus({
      dueDate: dateToDateOnly(record.dueDate),
      isCancelled: record.isCancelled,
      paidAmount: paid,
      scheduledAmount: scheduled,
      today,
    }),
    supplierName: record.order.supplier.displayName,
  };
}

function directionSummary(
  order: OrderSummary,
  records: InstallmentRecord[],
  direction: PaymentDirection,
  today: string,
): DirectionScheduleSummary {
  const base = paymentBase(order, direction);
  const relevant = records.filter((item) => item.direction === direction);
  const views = relevant.map((item) =>
    installmentView(item, base.amount, today),
  );
  const inBaseCurrency = views.filter(
    (item) => item.currencyCode === base.currencyCode,
  );
  const reconciliation = reconcileSchedule(
    base.amount,
    inBaseCurrency.map((item) => ({
      paidAmount: item.paidAmount,
      scheduledAmount: item.isCancelled
        ? item.paidAmount
        : item.scheduledAmount,
    })),
  );
  const foreignCurrencyInstallmentCount = views.length - inBaseCurrency.length;
  return {
    baseAmount: base.amount.toString(),
    baseCurrencyCode: base.currencyCode,
    foreignCurrencyInstallmentCount,
    installments: views,
    overallocated: reconciliation.overallocated.toString(),
    paid: reconciliation.paid.toString(),
    reconciliationComplete: foreignCurrencyInstallmentCount === 0,
    remainingTotal: reconciliation.remainingTotal.toString(),
    scheduled: reconciliation.scheduled.toString(),
    scheduledOutstanding: reconciliation.scheduledOutstanding.toString(),
    unscheduled: reconciliation.unscheduled.toString(),
  };
}

async function requiredOrder(orderId: string): Promise<OrderSummary> {
  const order = await getOrder(orderId);
  if (!order)
    throw new PaymentNotFoundError("The procurement order no longer exists.");
  return order;
}

export async function getOrderPaymentSummary(
  orderId: string,
): Promise<OrderPaymentSummary> {
  const [order, records] = await Promise.all([
    requiredOrder(orderId),
    getDatabase().paymentInstallment.findMany({
      where: { orderId },
      include: installmentInclude,
      orderBy: [{ direction: "asc" }, { sequence: "asc" }],
    }),
  ]);
  const today = businessToday();
  return {
    client: directionSummary(
      order,
      records,
      PaymentDirection.CLIENT_RECEIPT,
      today,
    ),
    orderId,
    supplier: directionSummary(
      order,
      records,
      PaymentDirection.SUPPLIER_PAYMENT,
      today,
    ),
  };
}

function amountForInput(
  input: CreateInstallmentInput | UpdateInstallmentInput,
  base: ReturnType<typeof paymentBase>,
): Decimal {
  if (input.basis === InstallmentBasis.PERCENTAGE) {
    if (input.currencyCode !== base.currencyCode) {
      throw new PaymentValidationError(
        "Percentage installments must use the payable or receivable currency.",
      );
    }
    if (!input.percentageRate || base.amount.isZero()) {
      throw new PaymentValidationError(
        "Percentage installments require a non-zero payment base.",
      );
    }
    return scheduledAmountFromPercentage(base.amount, input.percentageRate);
  }
  if (!input.fixedAmount) {
    throw new PaymentValidationError("Enter a fixed installment amount.");
  }
  return new Decimal(input.fixedAmount);
}

async function assertCurrency(code: string): Promise<void> {
  const currency = await getDatabase().currency.findFirst({
    where: { code, isActive: true },
    select: { code: true },
  });
  if (!currency) throw new PaymentValidationError("Choose an active currency.");
}

export async function createInstallment(
  actorId: string,
  input: CreateInstallmentInput,
): Promise<void> {
  const [order] = await Promise.all([
    requiredOrder(input.orderId),
    assertCurrency(input.currencyCode),
  ]);
  const base = paymentBase(order, input.direction);
  const amount = amountForInput(input, base);
  const database = getDatabase();
  await database.$transaction(
    async (transaction) => {
      const latest = await transaction.paymentInstallment.findFirst({
        where: { orderId: input.orderId, direction: input.direction },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });
      await transaction.paymentInstallment.create({
        data: {
          basis: input.basis,
          createdById: actorId,
          currencyCode: input.currencyCode,
          direction: input.direction,
          dueDate: dateOnlyToDate(input.dueDate),
          expectedFxRateToReporting:
            input.currencyCode === order.project.reportingCurrencyCode
              ? null
              : (input.expectedFxRate ?? null),
          label: input.label,
          notes: input.notes ?? null,
          orderId: input.orderId,
          percentageRate:
            input.basis === InstallmentBasis.PERCENTAGE
              ? (input.percentageRate ?? null)
              : null,
          scheduledAmount: amount.toFixed(4),
          sequence: (latest?.sequence ?? 0) + 1,
          updatedById: actorId,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateInstallment(
  actorId: string,
  input: UpdateInstallmentInput,
): Promise<void> {
  const current = await getDatabase().paymentInstallment.findUnique({
    where: { id: input.id },
    include: { settlements: { select: { amount: true } } },
  });
  if (!current) throw new PaymentNotFoundError();
  if (
    current.orderId !== input.orderId ||
    current.direction !== input.direction
  ) {
    throw new PaymentValidationError(
      "An installment cannot move to another payment flow.",
    );
  }
  if (
    current.settlements.length > 0 &&
    current.currencyCode !== input.currencyCode
  ) {
    throw new PaymentValidationError(
      "Currency cannot change after a payment or receipt is recorded.",
    );
  }
  const [order] = await Promise.all([
    requiredOrder(input.orderId),
    assertCurrency(input.currencyCode),
  ]);
  const amount = amountForInput(input, paymentBase(order, input.direction));
  const paid = current.settlements.reduce(
    (total, settlement) => total.plus(settlement.amount),
    new Decimal(0),
  );
  if (paid.greaterThan(amount)) {
    throw new PaymentValidationError(
      "Scheduled amount cannot be reduced below the amount already paid or received.",
    );
  }
  await getDatabase().paymentInstallment.update({
    where: { id: input.id },
    data: {
      basis: input.basis,
      currencyCode: input.currencyCode,
      dueDate: dateOnlyToDate(input.dueDate),
      expectedFxRateToReporting:
        input.currencyCode === order.project.reportingCurrencyCode
          ? null
          : (input.expectedFxRate ?? null),
      label: input.label,
      notes: input.notes ?? null,
      percentageRate:
        input.basis === InstallmentBasis.PERCENTAGE
          ? (input.percentageRate ?? null)
          : null,
      scheduledAmount: amount.toFixed(4),
      updatedById: actorId,
    },
  });
}

export async function recordSettlement(
  actorId: string,
  input: SettlementInput,
): Promise<void> {
  await getDatabase().$transaction(
    async (transaction) => {
      const installment = await transaction.paymentInstallment.findUnique({
        where: { id: input.installmentId },
        include: {
          order: {
            select: { project: { select: { reportingCurrencyCode: true } } },
          },
          settlements: { select: { amount: true } },
        },
      });
      if (!installment) throw new PaymentNotFoundError();
      if (installment.isCancelled) {
        throw new PaymentValidationError(
          "A cancelled installment cannot be settled.",
        );
      }
      const paid = installment.settlements.reduce(
        (total, settlement) => total.plus(settlement.amount),
        new Decimal(0),
      );
      const nextPaid = paid.plus(input.amount);
      if (nextPaid.greaterThan(installment.scheduledAmount)) {
        throw new PaymentValidationError(
          "This entry would exceed the scheduled installment amount.",
        );
      }
      await transaction.paymentSettlement.create({
        data: {
          amount: input.amount,
          createdById: actorId,
          fxRateToReporting:
            installment.currencyCode ===
            installment.order.project.reportingCurrencyCode
              ? null
              : (input.fxRate ?? null),
          installmentId: installment.id,
          notes: input.notes ?? null,
          reference: input.reference ?? null,
          settledAt: dateOnlyToDate(input.settledAt),
          updatedById: actorId,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function markInstallmentSettled(
  actorId: string,
  installmentId: string,
): Promise<void> {
  const installment = await getDatabase().paymentInstallment.findUnique({
    where: { id: installmentId },
    include: { settlements: { select: { amount: true } } },
  });
  if (!installment) throw new PaymentNotFoundError();
  const paid = installment.settlements.reduce(
    (total, settlement) => total.plus(settlement.amount),
    new Decimal(0),
  );
  const remaining = new Decimal(installment.scheduledAmount).minus(paid);
  if (remaining.lessThanOrEqualTo(0)) return;
  await recordSettlement(actorId, {
    amount: remaining.toFixed(4),
    installmentId,
    settledAt: businessToday(),
  });
}

export async function removeSettlement(settlementId: string): Promise<void> {
  try {
    await getDatabase().paymentSettlement.delete({
      where: { id: settlementId },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new PaymentNotFoundError();
    }
    throw error;
  }
}

export async function cancelInstallment(
  actorId: string,
  installmentId: string,
): Promise<void> {
  try {
    await getDatabase().paymentInstallment.update({
      where: { id: installmentId },
      data: { isCancelled: true, updatedById: actorId },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new PaymentNotFoundError();
    }
    throw error;
  }
}

export async function removeUnpaidInstallment(
  installmentId: string,
): Promise<void> {
  const result = await getDatabase().paymentInstallment.deleteMany({
    where: { id: installmentId, settlements: { none: {} } },
  });
  if (result.count === 0) {
    throw new PaymentValidationError(
      "Only installments without recorded payments or receipts can be removed.",
    );
  }
}

export async function applyPaymentPreset(
  actorId: string,
  input: {
    direction: PaymentDirection;
    firstDueDate: string;
    orderId: string;
    preset: keyof typeof paymentSchedulePresets;
  },
): Promise<void> {
  const order = await requiredOrder(input.orderId);
  const base = paymentBase(order, input.direction);
  if (base.amount.isZero()) {
    throw new PaymentValidationError(
      "A preset requires a non-zero payment base.",
    );
  }
  const rates = paymentSchedulePresets[input.preset];
  await getDatabase().$transaction(
    async (transaction) => {
      const latest = await transaction.paymentInstallment.findFirst({
        where: { direction: input.direction, orderId: input.orderId },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });
      const firstSequence = (latest?.sequence ?? 0) + 1;
      await transaction.paymentInstallment.createMany({
        data: rates.map((rate, index) => ({
          basis: InstallmentBasis.PERCENTAGE,
          createdById: actorId,
          currencyCode: base.currencyCode,
          direction: input.direction,
          dueDate: dateOnlyToDate(
            addMonthsToDateOnly(input.firstDueDate, index),
          ),
          expectedFxRateToReporting: base.expectedFxRate,
          label:
            rates.length === 1
              ? "Full payment"
              : index === 0
                ? "Deposit"
                : index === rates.length - 1
                  ? "Balance"
                  : `Installment ${index + 1}`,
          orderId: input.orderId,
          percentageRate: rate,
          scheduledAmount: scheduledAmountFromPercentage(
            base.amount,
            rate,
          ).toFixed(4),
          sequence: firstSequence + index,
          updatedById: actorId,
        })),
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function listPaymentOptions() {
  const database = getDatabase();
  const [clients, currencies, projects, suppliers] = await Promise.all([
    database.client.findMany({
      orderBy: { displayName: "asc" },
      select: { displayName: true, id: true },
    }),
    database.currency.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { code: true },
    }),
    database.project.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    database.supplier.findMany({
      orderBy: { displayName: "asc" },
      select: { displayName: true, id: true },
    }),
  ]);
  return { clients, currencies, projects, suppliers };
}

export async function listPaymentInstallments(filters: {
  clientId?: string | undefined;
  currencyCode?: string | undefined;
  direction?: PaymentDirection | undefined;
  dueFrom?: string | undefined;
  dueTo?: string | undefined;
  projectId?: string | undefined;
  status?: DerivedPaymentStatus | undefined;
  supplierId?: string | undefined;
}): Promise<PaymentInstallmentView[]> {
  const records = await getDatabase().paymentInstallment.findMany({
    where: {
      ...(filters.currencyCode ? { currencyCode: filters.currencyCode } : {}),
      ...(filters.direction ? { direction: filters.direction } : {}),
      ...(filters.dueFrom || filters.dueTo
        ? {
            dueDate: {
              ...(filters.dueFrom
                ? { gte: dateOnlyToDate(filters.dueFrom) }
                : {}),
              ...(filters.dueTo ? { lte: dateOnlyToDate(filters.dueTo) } : {}),
            },
          }
        : {}),
      order: {
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
        ...(filters.clientId
          ? { project: { clientId: filters.clientId } }
          : {}),
      },
    },
    include: installmentInclude,
    orderBy: [{ dueDate: "asc" }, { sequence: "asc" }],
  });
  const today = businessToday();
  return records
    .map((record) => installmentView(record, null, today))
    .filter((item) => !filters.status || item.status === filters.status);
}

interface ReportingDirectionSummary {
  incompleteAmountCount: number;
  outstanding: string;
  paid: string;
  scheduled: string;
}

export interface ProjectPaymentSummary {
  cashIn: ReportingDirectionSummary;
  cashOut: ReportingDirectionSummary;
  reportingCurrencyCode: string;
}

function reportingDirectionSummary(
  records: InstallmentRecord[],
  direction: PaymentDirection,
  reportingCurrencyCode: string,
): ReportingDirectionSummary {
  const result = aggregateReportingCash({
    installments: records
      .filter((item) => item.direction === direction)
      .map((record) => {
        const originalPaid = paidAmount(record);
        return {
          currencyCode: record.currencyCode,
          expectedFxRate: record.expectedFxRateToReporting,
          isCancelled: record.isCancelled,
          outstandingAmount: record.isCancelled
            ? "0"
            : installmentOutstanding(
                record.scheduledAmount,
                originalPaid,
              ).toString(),
          scheduledAmount: record.scheduledAmount.toString(),
          settlements: record.settlements.map((settlement) => ({
            actualFxRate: settlement.fxRateToReporting,
            amount: settlement.amount.toString(),
          })),
        };
      }),
    reportingCurrencyCode,
  });
  return {
    incompleteAmountCount: result.incompleteAmountCount,
    outstanding: result.outstanding.toString(),
    paid: result.paid.toString(),
    scheduled: result.scheduled.toString(),
  };
}

export async function getProjectPaymentSummary(
  projectId: string,
): Promise<ProjectPaymentSummary | null> {
  const database = getDatabase();
  const [project, records] = await Promise.all([
    database.project.findUnique({
      where: { id: projectId },
      select: { reportingCurrencyCode: true },
    }),
    database.paymentInstallment.findMany({
      where: { order: { projectId } },
      include: installmentInclude,
    }),
  ]);
  if (!project) return null;
  return {
    cashIn: reportingDirectionSummary(
      records,
      PaymentDirection.CLIENT_RECEIPT,
      project.reportingCurrencyCode,
    ),
    cashOut: reportingDirectionSummary(
      records,
      PaymentDirection.SUPPLIER_PAYMENT,
      project.reportingCurrencyCode,
    ),
    reportingCurrencyCode: project.reportingCurrencyCode,
  };
}

export async function getProcurementCalendarEvents(
  from: string,
  to: string,
): Promise<ProcurementCalendarEvent[]> {
  const [installments, orders] = await Promise.all([
    listPaymentInstallments({ dueFrom: from, dueTo: to }),
    getDatabase().procurementOrder.findMany({
      where: {
        OR: [
          {
            expectedReadyDate: {
              gte: dateOnlyToDate(from),
              lte: dateOnlyToDate(to),
            },
          },
          {
            expectedDeliveryDate: {
              gte: dateOnlyToDate(from),
              lte: dateOnlyToDate(to),
            },
          },
          {
            actualDeliveryDate: {
              gte: dateOnlyToDate(from),
              lte: dateOnlyToDate(to),
            },
          },
        ],
      },
      select: {
        actualDeliveryDate: true,
        expectedDeliveryDate: true,
        expectedReadyDate: true,
        id: true,
        orderNumber: true,
        project: { select: { name: true } },
      },
    }),
  ]);
  return buildCalendarEvents({
    installments: installments.map((item) => ({
      currencyCode: item.currencyCode,
      direction: item.direction,
      dueDate: item.dueDate,
      id: item.id,
      isCancelled: item.isCancelled,
      label: item.label,
      orderId: item.orderId,
      orderNumber: item.orderNumber,
      paidAmount: item.paidAmount,
      projectName: item.projectName,
      scheduledAmount: item.scheduledAmount,
    })),
    orders: orders.map((order) => ({
      actualDeliveryDate: order.actualDeliveryDate
        ? dateToDateOnly(order.actualDeliveryDate)
        : null,
      expectedDeliveryDate: order.expectedDeliveryDate
        ? dateToDateOnly(order.expectedDeliveryDate)
        : null,
      expectedReadyDate: order.expectedReadyDate
        ? dateToDateOnly(order.expectedReadyDate)
        : null,
      id: order.id,
      orderNumber: order.orderNumber,
      projectName: order.project.name,
    })),
    today: businessToday(),
  });
}
