import "server-only";

import Decimal from "decimal.js";

import {
  FreightTreatment,
  PricingMode,
  Prisma,
  ProcurementCostCategory,
  ProcurementOrderStatus,
  VatDirection,
  VatRecoverability,
  VatTreatment,
} from "@/generated/prisma/client";
import {
  amountIncludingVat,
  crossCurrencyFinancialMetrics,
  economicLandedCost,
  landedCost,
  reportingAmount,
  sellingPriceFromTargetMargin,
  totalSellingRevenue,
  vatAmount as calculateVatAmount,
} from "@/domain/finance/calculations";
import type {
  CreateOrderInput,
  UpdateOrderInput,
} from "@/domain/procurement/validation";
import {
  addWeeksToDateOnly,
  dateOnlyToDate,
  dateToDateOnly,
} from "@/domain/payments/dates";
import { getDatabase } from "@/lib/db";

import { ProcurementNotFoundError, ProcurementRelationError } from "./errors";

const orderInclude = {
  buildings: {
    include: {
      building: { select: { id: true, name: true, shortCode: true } },
    },
  },
  costLines: true,
  project: { select: { id: true, name: true, reportingCurrencyCode: true } },
  supplier: {
    select: {
      defaultCurrencyCode: true,
      defaultLeadTimeWeeks: true,
      displayName: true,
      id: true,
    },
  },
  vatEntries: true,
} satisfies Prisma.ProcurementOrderInclude;
type OrderRecord = Prisma.ProcurementOrderGetPayload<{
  include: typeof orderInclude;
}>;

export interface VatSummary {
  amount: string;
  amountIsManual: boolean;
  countryCode: string | null;
  customTreatmentNote: string | null;
  rate: string | null;
  recoverability: VatRecoverability | null;
  reportingAmount: string | null;
  taxableBase: string;
  totalIncludingVat: string;
  treatment: VatTreatment;
}
export interface OrderCostSummary {
  conversionComplete: boolean;
  customsDuties: string | null;
  economicLandedCost: string | null;
  freight: string | null;
  grossMarginRate: string | null;
  grossProfit: string | null;
  inputVat: VatSummary | null;
  landedCost: string | null;
  markupRate: string | null;
  miscellaneous: string | null;
  missingFx: string[];
  outputVat: VatSummary | null;
  purchaseCost: string | null;
  purchaseFxRate: string | null;
  reportingEconomicLandedCost: string | null;
  reportingLandedCost: string | null;
  reportingSellingRevenue: string | null;
  sellingFxRate: string | null;
}
export interface OrderSummary {
  actualDeliveryDate: string | null;
  buildingIds: string[];
  buildings: string[];
  category: string | null;
  costs: OrderCostSummary;
  description: string | null;
  expectedDeliveryDate: string | null;
  expectedReadyDate: string | null;
  freightResaleAmount: string | null;
  freightTreatment: FreightTreatment;
  id: string;
  leadTimeWeeks: number | null;
  notes: string | null;
  orderCurrencyCode: string;
  orderNumber: string;
  orderDate: string | null;
  packageName: string;
  packageSellingPrice: string | null;
  pricingMode: PricingMode;
  project: { id: string; name: string; reportingCurrencyCode: string };
  sellingCurrencyCode: string;
  status: ProcurementOrderStatus;
  supplier: {
    defaultCurrencyCode: string;
    defaultLeadTimeWeeks: number | null;
    displayName: string;
    id: string;
  };
  supplierOrderConfirmationReference: string | null;
  supplierQuoteReference: string | null;
  targetMarginRate: string | null;
  totalSellingRevenue: string | null;
  updatedAt: string;
}
export interface ProjectProcurementSummary {
  convertedOrderCount: number;
  incompleteOrderCount: number;
  totalEconomicCost: string;
  totalGrossProfit: string;
  totalSellingRevenue: string;
}

function costAmount(
  order: OrderRecord,
  category: ProcurementCostCategory,
): string | null {
  return (
    order.costLines
      .find((line) => line.category === category)
      ?.originalAmount.toString() ?? null
  );
}
function vatEntry(order: OrderRecord, direction: VatDirection) {
  return order.vatEntries.find((entry) => entry.direction === direction);
}
function fxRate(
  original: string,
  reporting: string,
  rate: Decimal | null,
): string | undefined {
  return original === reporting ? undefined : (rate?.toString() ?? undefined);
}
function vatSummary(
  entry: OrderRecord["vatEntries"][number] | undefined,
  currency: string,
  reportingCurrency: string,
  rate: Decimal | null,
): VatSummary | null {
  if (!entry) return null;
  const reporting = reportingAmount({
    fxRateToReporting: fxRate(currency, reportingCurrency, rate),
    originalAmount: entry.vatAmount.toString(),
    originalCurrencyCode: currency,
    reportingCurrencyCode: reportingCurrency,
  });
  return {
    amount: entry.vatAmount.toString(),
    amountIsManual: entry.isAmountOverride,
    countryCode: entry.countryCode,
    customTreatmentNote: entry.customTreatmentNote,
    rate: entry.vatRate?.toString() ?? null,
    recoverability: entry.recoverability,
    reportingAmount: reporting?.toString() ?? null,
    taxableBase: entry.taxableBaseAmount.toString(),
    totalIncludingVat: amountIncludingVat(
      entry.taxableBaseAmount.toString(),
      entry.vatAmount.toString(),
    ).toString(),
    treatment: entry.treatment,
  };
}
function currentLandedCost(order: OrderRecord): Decimal | null {
  if (order.costLines.length === 0) return null;
  return landedCost({
    customsDuties:
      costAmount(order, ProcurementCostCategory.CUSTOMS_DUTIES) ?? "0",
    freight: costAmount(order, ProcurementCostCategory.FREIGHT) ?? "0",
    miscellaneous:
      costAmount(order, ProcurementCostCategory.MISCELLANEOUS) ?? "0",
    supplierPurchase:
      costAmount(order, ProcurementCostCategory.SUPPLIER_PURCHASE) ?? "0",
  });
}
function targetPackagePrice(
  order: OrderRecord,
  economicCost: Decimal | null,
): Decimal | null {
  if (!economicCost || !order.targetMarginRate) return null;
  const sellingRate = reportingAmount({
    fxRateToReporting: fxRate(
      order.sellingCurrencyCode,
      order.project.reportingCurrencyCode,
      order.sellingFxRateToReporting,
    ),
    originalAmount: "1",
    originalCurrencyCode: order.sellingCurrencyCode,
    reportingCurrencyCode: order.project.reportingCurrencyCode,
  });
  if (!sellingRate) return null;
  const requiredOriginal = sellingPriceFromTargetMargin(
    economicCost,
    order.targetMarginRate.toString(),
  ).dividedBy(sellingRate);
  const freight =
    order.freightTreatment === FreightTreatment.RECHARGED_SEPARATELY
      ? new Decimal(order.freightResaleAmount?.toString() ?? "0")
      : new Decimal(0);
  const price = requiredOriginal.minus(freight);
  return price.isNegative() ? null : price;
}

export function summarizeOrder(order: OrderRecord): OrderSummary {
  const landed = currentLandedCost(order);
  const input = vatEntry(order, VatDirection.INPUT);
  const output = vatEntry(order, VatDirection.OUTPUT);
  const nonRecoverableInputVat =
    input?.recoverability === VatRecoverability.NON_RECOVERABLE
      ? new Decimal(input.vatAmount.toString())
      : new Decimal(0);
  const economic = landed
    ? economicLandedCost(landed, nonRecoverableInputVat)
    : null;
  const reportingLanded = landed
    ? reportingAmount({
        fxRateToReporting: fxRate(
          order.orderCurrencyCode,
          order.project.reportingCurrencyCode,
          order.purchaseFxRateToReporting,
        ),
        originalAmount: landed,
        originalCurrencyCode: order.orderCurrencyCode,
        reportingCurrencyCode: order.project.reportingCurrencyCode,
      })
    : null;
  const reportingEconomic = economic
    ? reportingAmount({
        fxRateToReporting: fxRate(
          order.orderCurrencyCode,
          order.project.reportingCurrencyCode,
          order.purchaseFxRateToReporting,
        ),
        originalAmount: economic,
        originalCurrencyCode: order.orderCurrencyCode,
        reportingCurrencyCode: order.project.reportingCurrencyCode,
      })
    : null;
  const packagePrice =
    order.pricingMode === PricingMode.SELLING_PRICE
      ? order.sellingPriceAmount
        ? new Decimal(order.sellingPriceAmount.toString())
        : null
      : targetPackagePrice(order, reportingEconomic);
  const totalRevenue = packagePrice
    ? totalSellingRevenue(
        packagePrice,
        order.freightTreatment,
        order.freightResaleAmount?.toString() ?? "0",
      )
    : null;
  const reportingRevenue = totalRevenue
    ? reportingAmount({
        fxRateToReporting: fxRate(
          order.sellingCurrencyCode,
          order.project.reportingCurrencyCode,
          order.sellingFxRateToReporting,
        ),
        originalAmount: totalRevenue,
        originalCurrencyCode: order.sellingCurrencyCode,
        reportingCurrencyCode: order.project.reportingCurrencyCode,
      })
    : null;
  const metrics =
    economic && totalRevenue
      ? crossCurrencyFinancialMetrics({
          economicLandedCost: economic,
          purchaseCurrencyCode: order.orderCurrencyCode,
          purchaseFxRateToReporting: fxRate(
            order.orderCurrencyCode,
            order.project.reportingCurrencyCode,
            order.purchaseFxRateToReporting,
          ),
          reportingCurrencyCode: order.project.reportingCurrencyCode,
          sellingCurrencyCode: order.sellingCurrencyCode,
          sellingFxRateToReporting: fxRate(
            order.sellingCurrencyCode,
            order.project.reportingCurrencyCode,
            order.sellingFxRateToReporting,
          ),
          sellingRevenue: totalRevenue,
        })
      : null;
  const missingFx: string[] = [];
  if (landed && reportingLanded === null) missingFx.push("purchase FX");
  if (totalRevenue && reportingRevenue === null) missingFx.push("selling FX");
  return {
    actualDeliveryDate: order.actualDeliveryDate
      ? dateToDateOnly(order.actualDeliveryDate)
      : null,
    buildingIds: order.buildings.map(({ buildingId }) => buildingId),
    buildings: order.buildings.map(
      ({ building }) => building.shortCode || building.name,
    ),
    category: order.category,
    description: order.description,
    expectedDeliveryDate: order.expectedDeliveryDate
      ? dateToDateOnly(order.expectedDeliveryDate)
      : null,
    expectedReadyDate: order.expectedReadyDate
      ? dateToDateOnly(order.expectedReadyDate)
      : null,
    freightResaleAmount: order.freightResaleAmount?.toString() ?? null,
    freightTreatment: order.freightTreatment,
    id: order.id,
    leadTimeWeeks: order.leadTimeWeeks,
    notes: order.notes,
    orderCurrencyCode: order.orderCurrencyCode,
    orderNumber: order.orderNumber,
    orderDate: order.orderDate ? dateToDateOnly(order.orderDate) : null,
    packageName: order.packageName,
    packageSellingPrice: packagePrice?.toString() ?? null,
    pricingMode: order.pricingMode,
    project: order.project,
    sellingCurrencyCode: order.sellingCurrencyCode,
    status: order.status,
    supplier: order.supplier,
    supplierOrderConfirmationReference:
      order.supplierOrderConfirmationReference,
    supplierQuoteReference: order.supplierQuoteReference,
    targetMarginRate: order.targetMarginRate?.toString() ?? null,
    totalSellingRevenue: totalRevenue?.toString() ?? null,
    updatedAt: order.updatedAt.toISOString(),
    costs: {
      conversionComplete: missingFx.length === 0,
      customsDuties: costAmount(order, ProcurementCostCategory.CUSTOMS_DUTIES),
      economicLandedCost: economic?.toString() ?? null,
      freight: costAmount(order, ProcurementCostCategory.FREIGHT),
      grossMarginRate: metrics?.grossMarginRate?.toString() ?? null,
      grossProfit: metrics?.grossProfit.toString() ?? null,
      inputVat: vatSummary(
        input,
        order.orderCurrencyCode,
        order.project.reportingCurrencyCode,
        order.purchaseFxRateToReporting,
      ),
      landedCost: landed?.toString() ?? null,
      markupRate: metrics?.markupRate?.toString() ?? null,
      miscellaneous: costAmount(order, ProcurementCostCategory.MISCELLANEOUS),
      missingFx,
      outputVat: vatSummary(
        output,
        order.sellingCurrencyCode,
        order.project.reportingCurrencyCode,
        order.sellingFxRateToReporting,
      ),
      purchaseCost: costAmount(
        order,
        ProcurementCostCategory.SUPPLIER_PURCHASE,
      ),
      purchaseFxRate: order.purchaseFxRateToReporting?.toString() ?? null,
      reportingEconomicLandedCost: reportingEconomic?.toString() ?? null,
      reportingLandedCost: reportingLanded?.toString() ?? null,
      reportingSellingRevenue: reportingRevenue?.toString() ?? null,
      sellingFxRate: order.sellingFxRateToReporting?.toString() ?? null,
    },
  };
}

export function projectProcurementSummary(
  orders: OrderSummary[],
): ProjectProcurementSummary {
  let cost = new Decimal(0);
  let revenue = new Decimal(0);
  let incompleteOrderCount = 0;
  for (const order of orders) {
    if (
      !order.costs.conversionComplete ||
      order.costs.reportingEconomicLandedCost === null ||
      order.costs.reportingSellingRevenue === null
    ) {
      incompleteOrderCount += 1;
      continue;
    }
    cost = cost.plus(order.costs.reportingEconomicLandedCost);
    revenue = revenue.plus(order.costs.reportingSellingRevenue);
  }
  return {
    convertedOrderCount: orders.length - incompleteOrderCount,
    incompleteOrderCount,
    totalEconomicCost: cost.toString(),
    totalGrossProfit: revenue.minus(cost).toString(),
    totalSellingRevenue: revenue.toString(),
  };
}

function inputLandedCost(input: CreateOrderInput): Decimal | null {
  if (
    !input.purchaseCost &&
    !input.freight &&
    !input.customsDuties &&
    !input.miscellaneous
  )
    return null;
  return landedCost({
    supplierPurchase: input.purchaseCost ?? "0",
    freight: input.freight ?? "0",
    customsDuties: input.customsDuties ?? "0",
    miscellaneous: input.miscellaneous ?? "0",
  });
}
function inputEconomicCost(
  input: CreateOrderInput,
  reportingCurrencyCode: string,
): Decimal | null {
  const landed = inputLandedCost(input);
  if (!landed) return null;
  const reporting = reportingAmount({
    fxRateToReporting: input.purchaseFxRate,
    originalAmount: landed,
    originalCurrencyCode: input.orderCurrencyCode,
    reportingCurrencyCode,
  });
  if (!reporting) return null;
  if (
    input.inputVatTreatment &&
    input.inputVatRecoverability === VatRecoverability.NON_RECOVERABLE &&
    input.inputVatTaxableBase
  ) {
    const vat =
      input.inputVatAmount ??
      calculateVatAmount(
        input.inputVatTaxableBase,
        input.inputVatRate ?? "0",
      ).toFixed(4);
    const reportingVat = reportingAmount({
      fxRateToReporting: input.purchaseFxRate,
      originalAmount: vat,
      originalCurrencyCode: input.orderCurrencyCode,
      reportingCurrencyCode,
    });
    return reportingVat ? economicLandedCost(reporting, reportingVat) : null;
  }
  return reporting;
}
async function assertRelations(input: CreateOrderInput): Promise<string> {
  const database = getDatabase();
  const [project, supplier, purchaseCurrency, sellingCurrency, buildings] =
    await Promise.all([
      database.project.findUnique({
        where: { id: input.projectId },
        select: { reportingCurrencyCode: true },
      }),
      database.supplier.findUnique({
        where: { id: input.supplierId },
        select: { id: true },
      }),
      database.currency.findFirst({
        where: { code: input.orderCurrencyCode, isActive: true },
        select: { code: true },
      }),
      database.currency.findFirst({
        where: { code: input.sellingCurrencyCode, isActive: true },
        select: { code: true },
      }),
      input.buildingIds.length
        ? database.building.findMany({
            where: {
              id: { in: input.buildingIds },
              projectId: input.projectId,
            },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);
  if (!project || !supplier || !purchaseCurrency || !sellingCurrency)
    throw new ProcurementRelationError(
      "Choose valid active project, supplier, and currencies.",
    );
  if (buildings.length !== input.buildingIds.length)
    throw new ProcurementRelationError(
      "Every selected building must belong to the chosen project.",
    );
  if (input.pricingMode === PricingMode.TARGET_MARGIN) {
    const economic = inputEconomicCost(input, project.reportingCurrencyCode);
    const sellingRate = reportingAmount({
      fxRateToReporting: input.sellingFxRate,
      originalAmount: "1",
      originalCurrencyCode: input.sellingCurrencyCode,
      reportingCurrencyCode: project.reportingCurrencyCode,
    });
    if (!economic || !sellingRate || !input.targetMarginRate)
      throw new ProcurementRelationError(
        "Target-margin pricing requires converted current cost and selling FX.",
      );
    const freight =
      input.freightTreatment === FreightTreatment.RECHARGED_SEPARATELY
        ? new Decimal(input.freightResaleAmount ?? "0")
        : new Decimal(0);
    if (
      sellingPriceFromTargetMargin(economic, input.targetMarginRate)
        .dividedBy(sellingRate)
        .minus(freight)
        .isNegative()
    )
      throw new ProcurementRelationError(
        "Freight resale cannot exceed required selling revenue.",
      );
  }
  return project.reportingCurrencyCode;
}
function orderData(input: CreateOrderInput, reportingCurrencyCode: string) {
  const expectedReadyDate =
    input.expectedReadyDate ??
    (input.orderDate !== undefined && input.leadTimeWeeks !== undefined
      ? addWeeksToDateOnly(input.orderDate, input.leadTimeWeeks)
      : undefined);
  return {
    actualDeliveryDate: input.actualDeliveryDate
      ? dateOnlyToDate(input.actualDeliveryDate)
      : null,
    category: input.category ?? null,
    description: input.description ?? null,
    expectedDeliveryDate: input.expectedDeliveryDate
      ? dateOnlyToDate(input.expectedDeliveryDate)
      : null,
    expectedReadyDate: expectedReadyDate
      ? dateOnlyToDate(expectedReadyDate)
      : null,
    freightResaleAmount:
      input.freightTreatment === FreightTreatment.RECHARGED_SEPARATELY
        ? (input.freightResaleAmount ?? null)
        : null,
    freightTreatment: input.freightTreatment,
    notes: input.notes ?? null,
    leadTimeWeeks: input.leadTimeWeeks ?? null,
    orderCurrencyCode: input.orderCurrencyCode,
    orderNumber: input.orderNumber,
    orderDate: input.orderDate ? dateOnlyToDate(input.orderDate) : null,
    packageName: input.packageName,
    pricingMode: input.pricingMode,
    projectId: input.projectId,
    purchaseFxRateToReporting:
      input.orderCurrencyCode === reportingCurrencyCode
        ? null
        : (input.purchaseFxRate ?? null),
    sellingCurrencyCode: input.sellingCurrencyCode,
    sellingFxRateToReporting:
      input.sellingCurrencyCode === reportingCurrencyCode
        ? null
        : (input.sellingFxRate ?? null),
    sellingPriceAmount:
      input.pricingMode === PricingMode.SELLING_PRICE
        ? (input.sellingPriceAmount ?? null)
        : null,
    status: input.status,
    supplierId: input.supplierId,
    supplierOrderConfirmationReference:
      input.supplierOrderConfirmationReference ?? null,
    supplierQuoteReference: input.supplierQuoteReference ?? null,
    targetMarginRate:
      input.pricingMode === PricingMode.TARGET_MARGIN
        ? (input.targetMarginRate ?? null)
        : null,
  };
}
function costLines(input: CreateOrderInput) {
  return [
    [ProcurementCostCategory.SUPPLIER_PURCHASE, input.purchaseCost],
    [ProcurementCostCategory.FREIGHT, input.freight],
    [ProcurementCostCategory.CUSTOMS_DUTIES, input.customsDuties],
    [ProcurementCostCategory.MISCELLANEOUS, input.miscellaneous],
  ] as const;
}
function vatEntries(input: CreateOrderInput, actorId: string) {
  const values = [
    {
      amount: input.inputVatAmount,
      countryCode: input.inputVatCountryCode,
      customTreatmentNote: input.inputVatCustomTreatmentNote,
      direction: VatDirection.INPUT,
      rate: input.inputVatRate,
      recoverability: input.inputVatRecoverability ?? null,
      taxableBase: input.inputVatTaxableBase,
      treatment: input.inputVatTreatment,
    },
    {
      amount: input.outputVatAmount,
      countryCode: input.outputVatCountryCode,
      customTreatmentNote: input.outputVatCustomTreatmentNote,
      direction: VatDirection.OUTPUT,
      rate: input.outputVatRate,
      recoverability: null,
      taxableBase: input.outputVatTaxableBase,
      treatment: input.outputVatTreatment,
    },
  ] as const;
  return values.flatMap((entry) =>
    entry.treatment && entry.taxableBase
      ? [
          {
            countryCode: entry.countryCode ?? null,
            customTreatmentNote: entry.customTreatmentNote ?? null,
            direction: entry.direction,
            isAmountOverride: Boolean(entry.amount),
            recoverability: entry.recoverability,
            taxableBaseAmount: entry.taxableBase,
            treatment: entry.treatment,
            vatAmount:
              entry.amount ??
              calculateVatAmount(entry.taxableBase, entry.rate ?? "0").toFixed(
                4,
              ),
            vatRate: entry.rate ?? null,
            createdById: actorId,
            updatedById: actorId,
          },
        ]
      : [],
  );
}
async function replaceOrderFinancialData(
  transaction: Prisma.TransactionClient,
  orderId: string,
  actorId: string,
  input: CreateOrderInput,
): Promise<void> {
  await Promise.all([
    transaction.procurementOrderCostLine.deleteMany({ where: { orderId } }),
    transaction.procurementOrderVatEntry.deleteMany({ where: { orderId } }),
  ]);
  const costs = costLines(input).flatMap(([category, originalAmount]) =>
    originalAmount
      ? [
          {
            category,
            originalAmount,
            createdById: actorId,
            updatedById: actorId,
            orderId,
          },
        ]
      : [],
  );
  const vat = vatEntries(input, actorId).map((entry) => ({
    ...entry,
    orderId,
  }));
  await Promise.all([
    costs.length
      ? transaction.procurementOrderCostLine.createMany({ data: costs })
      : Promise.resolve(),
    vat.length
      ? transaction.procurementOrderVatEntry.createMany({ data: vat })
      : Promise.resolve(),
  ]);
}
export async function listOrderOptions() {
  const database = getDatabase();
  const [projects, suppliers, currencies] = await Promise.all([
    database.project.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        buildings: {
          orderBy: { name: "asc" },
          select: { id: true, isActive: true, name: true, shortCode: true },
        },
        client: { select: { defaultCurrencyCode: true } },
        id: true,
        name: true,
        reportingCurrencyCode: true,
      },
    }),
    database.supplier.findMany({
      orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
      select: {
        defaultCurrencyCode: true,
        defaultLeadTimeWeeks: true,
        displayName: true,
        id: true,
      },
    }),
    database.currency.findMany({
      orderBy: { code: "asc" },
      where: { isActive: true },
      select: { code: true, name: true },
    }),
  ]);
  return {
    currencies,
    freightTreatments: Object.values(FreightTreatment),
    pricingModes: Object.values(PricingMode),
    projects,
    statuses: Object.values(ProcurementOrderStatus),
    suppliers,
    vatRecoverabilities: Object.values(VatRecoverability),
    vatTreatments: Object.values(VatTreatment),
  };
}
export async function listOrders(filters: {
  projectId?: string | undefined;
  query: string;
  status?: ProcurementOrderStatus | undefined;
  supplierId?: string | undefined;
}): Promise<OrderSummary[]> {
  const query = filters.query.trim();
  const orders = await getDatabase().procurementOrder.findMany({
    where: {
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(query
        ? {
            OR: [
              { orderNumber: { contains: query, mode: "insensitive" } },
              { packageName: { contains: query, mode: "insensitive" } },
              {
                supplierQuoteReference: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              { project: { name: { contains: query, mode: "insensitive" } } },
              {
                supplier: {
                  displayName: { contains: query, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    },
    include: orderInclude,
    orderBy: { updatedAt: "desc" },
  });
  return orders.map(summarizeOrder);
}
export async function getOrder(orderId: string): Promise<OrderSummary | null> {
  const order = await getDatabase().procurementOrder.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  return order ? summarizeOrder(order) : null;
}
export async function listProjectOrders(
  projectId: string,
): Promise<OrderSummary[]> {
  return listOrders({ projectId, query: "" });
}
export async function createOrder(
  actorId: string,
  input: CreateOrderInput,
): Promise<string> {
  const reportingCurrencyCode = await assertRelations(input);
  return getDatabase().$transaction(async (transaction) => {
    const order = await transaction.procurementOrder.create({
      data: {
        ...orderData(input, reportingCurrencyCode),
        buildings: {
          create: input.buildingIds.map((buildingId) => ({
            buildingId,
            createdById: actorId,
          })),
        },
        createdById: actorId,
        updatedById: actorId,
      },
      select: { id: true },
    });
    await replaceOrderFinancialData(transaction, order.id, actorId, input);
    return order.id;
  });
}
export async function updateOrder(
  actorId: string,
  input: UpdateOrderInput,
): Promise<void> {
  const reportingCurrencyCode = await assertRelations(input);
  const { id, ...fields } = input;
  try {
    await getDatabase().$transaction(async (transaction) => {
      await transaction.procurementOrder.update({
        where: { id },
        data: {
          ...orderData(fields, reportingCurrencyCode),
          updatedById: actorId,
        },
      });
      await transaction.procurementOrderBuilding.deleteMany({
        where: { orderId: id },
      });
      if (input.buildingIds.length)
        await transaction.procurementOrderBuilding.createMany({
          data: input.buildingIds.map((buildingId) => ({
            buildingId,
            createdById: actorId,
            orderId: id,
          })),
        });
      await replaceOrderFinancialData(transaction, id, actorId, fields);
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    )
      throw new ProcurementNotFoundError();
    throw error;
  }
}
