import "server-only";

import Decimal from "decimal.js";

import {
  FinancialState,
  FreightTreatment,
  PricingMode,
  Prisma,
  ProcurementCostCategory,
  ProcurementOrderStatus,
} from "@/generated/prisma/client";
import {
  financialMetrics,
  landedCost,
  packageSellingPriceFromTargetMargin,
  totalSellingRevenue,
} from "@/domain/finance/calculations";
import type {
  CreateOrderInput,
  FinancialStateInput,
  UpdateOrderInput,
} from "@/domain/procurement/validation";
import { getDatabase } from "@/lib/db";

import { ProcurementNotFoundError, ProcurementRelationError } from "./errors";

const orderInclude = {
  buildings: {
    include: {
      building: { select: { id: true, name: true, shortCode: true } },
    },
  },
  financials: { include: { costLines: true } },
  project: { select: { id: true, name: true, reportingCurrencyCode: true } },
  supplier: { select: { displayName: true, id: true } },
} satisfies Prisma.ProcurementOrderInclude;

type OrderRecord = Prisma.ProcurementOrderGetPayload<{
  include: typeof orderInclude;
}>;

export interface FinancialStateSummary {
  customsDuties: string | null;
  freight: string | null;
  grossMarginRate: string | null;
  grossProfit: string | null;
  landedCost: string | null;
  markupRate: string | null;
  miscellaneous: string | null;
  state: FinancialState;
  supplierDiscount: string | null;
  supplierPurchase: string | null;
}

export interface OrderSummary {
  buildingIds: string[];
  buildings: string[];
  category: string | null;
  description: string | null;
  financialStates: FinancialStateSummary[];
  freightResaleAmount: string | null;
  freightTreatment: FreightTreatment;
  id: string;
  notes: string | null;
  orderCurrencyCode: string;
  orderNumber: string;
  packageName: string;
  packageSellingPrice: string | null;
  pricingMode: PricingMode;
  pricingSourceState: FinancialState;
  project: { id: string; name: string };
  sellingCurrencyCode: string;
  status: ProcurementOrderStatus;
  supplier: { displayName: string; id: string };
  supplierOrderConfirmationReference: string | null;
  supplierQuoteReference: string | null;
  targetMarginRate: string | null;
  totalSellingRevenue: string | null;
  updatedAt: string;
}

function amountFor(
  financial: OrderRecord["financials"][number] | undefined,
  category: ProcurementCostCategory,
): string | null {
  return (
    financial?.costLines
      .find((line) => line.category === category)
      ?.originalAmount.toString() ?? null
  );
}

function landedForFinancial(
  financial: OrderRecord["financials"][number] | undefined,
): Decimal | null {
  if (!financial || financial.costLines.length === 0) return null;
  return landedCost({
    customsDuties:
      amountFor(financial, ProcurementCostCategory.CUSTOMS_DUTIES) ?? "0",
    freight: amountFor(financial, ProcurementCostCategory.FREIGHT) ?? "0",
    miscellaneous:
      amountFor(financial, ProcurementCostCategory.MISCELLANEOUS) ?? "0",
    supplierDiscount:
      amountFor(financial, ProcurementCostCategory.SUPPLIER_DISCOUNT) ?? "0",
    supplierPurchase:
      amountFor(financial, ProcurementCostCategory.SUPPLIER_PURCHASE) ?? "0",
  });
}

function commercialValues(order: OrderRecord): {
  packagePrice: Decimal | null;
  totalRevenue: Decimal | null;
} {
  const source = order.financials.find(
    (item) => item.state === order.pricingSourceState,
  );
  const sourceLandedCost = landedForFinancial(source);
  const freightResale = order.freightResaleAmount?.toString() ?? "0";
  let packagePrice: Decimal | null = null;

  if (
    order.pricingMode === PricingMode.SELLING_PRICE &&
    order.sellingPriceAmount
  ) {
    packagePrice = new Decimal(order.sellingPriceAmount.toString());
  } else if (
    order.pricingMode === PricingMode.TARGET_MARGIN &&
    order.targetMarginRate &&
    sourceLandedCost
  ) {
    packagePrice = packageSellingPriceFromTargetMargin(
      sourceLandedCost,
      order.targetMarginRate.toString(),
      order.freightTreatment,
      freightResale,
    );
  }

  return {
    packagePrice,
    totalRevenue: packagePrice
      ? totalSellingRevenue(packagePrice, order.freightTreatment, freightResale)
      : null,
  };
}

export function summarizeOrder(order: OrderRecord): OrderSummary {
  const commercial = commercialValues(order);
  const states = Object.values(FinancialState).map((state) => {
    const financial = order.financials.find((item) => item.state === state);
    const landed = landedForFinancial(financial);
    const metrics =
      landed && commercial.totalRevenue
        ? financialMetrics({
            landedCost: landed,
            sellingPrice: commercial.totalRevenue,
          })
        : null;
    return {
      customsDuties: amountFor(
        financial,
        ProcurementCostCategory.CUSTOMS_DUTIES,
      ),
      freight: amountFor(financial, ProcurementCostCategory.FREIGHT),
      grossMarginRate: metrics?.grossMarginRate?.toString() ?? null,
      grossProfit: metrics?.grossProfit.toString() ?? null,
      landedCost: landed?.toString() ?? null,
      markupRate: metrics?.markupRate?.toString() ?? null,
      miscellaneous: amountFor(
        financial,
        ProcurementCostCategory.MISCELLANEOUS,
      ),
      state,
      supplierDiscount: amountFor(
        financial,
        ProcurementCostCategory.SUPPLIER_DISCOUNT,
      ),
      supplierPurchase: amountFor(
        financial,
        ProcurementCostCategory.SUPPLIER_PURCHASE,
      ),
    };
  });

  return {
    buildingIds: order.buildings.map(({ buildingId }) => buildingId),
    buildings: order.buildings.map(
      ({ building }) => building.shortCode || building.name,
    ),
    category: order.category,
    description: order.description,
    financialStates: states,
    freightResaleAmount: order.freightResaleAmount?.toString() ?? null,
    freightTreatment: order.freightTreatment,
    id: order.id,
    notes: order.notes,
    orderCurrencyCode: order.orderCurrencyCode,
    orderNumber: order.orderNumber,
    packageName: order.packageName,
    packageSellingPrice: commercial.packagePrice?.toString() ?? null,
    pricingMode: order.pricingMode,
    pricingSourceState: order.pricingSourceState,
    project: order.project,
    sellingCurrencyCode: order.sellingCurrencyCode,
    status: order.status,
    supplier: order.supplier,
    supplierOrderConfirmationReference:
      order.supplierOrderConfirmationReference,
    supplierQuoteReference: order.supplierQuoteReference,
    targetMarginRate: order.targetMarginRate?.toString() ?? null,
    totalSellingRevenue: commercial.totalRevenue?.toString() ?? null,
    updatedAt: order.updatedAt.toISOString(),
  };
}

function stateHasValues(state: FinancialStateInput): boolean {
  return Boolean(
    state.supplierPurchase ||
    state.supplierDiscount ||
    state.freight ||
    state.customsDuties ||
    state.miscellaneous,
  );
}

function costLines(
  state: FinancialStateInput,
  currencyCode: string,
  actorId: string,
) {
  const values = [
    [ProcurementCostCategory.SUPPLIER_PURCHASE, state.supplierPurchase],
    [ProcurementCostCategory.SUPPLIER_DISCOUNT, state.supplierDiscount],
    [ProcurementCostCategory.FREIGHT, state.freight],
    [ProcurementCostCategory.CUSTOMS_DUTIES, state.customsDuties],
    [ProcurementCostCategory.MISCELLANEOUS, state.miscellaneous],
  ] as const;
  return values.flatMap(([category, amount]) =>
    amount
      ? [
          {
            category,
            createdById: actorId,
            originalAmount: amount,
            originalCurrencyCode: currencyCode,
            reportingAmount: amount,
            reportingCurrencyCode: currencyCode,
            updatedById: actorId,
          },
        ]
      : [],
  );
}

function inputLandedCost(state: FinancialStateInput): Decimal | null {
  if (!stateHasValues(state)) return null;
  return landedCost({
    customsDuties: state.customsDuties ?? "0",
    freight: state.freight ?? "0",
    miscellaneous: state.miscellaneous ?? "0",
    supplierDiscount: state.supplierDiscount ?? "0",
    supplierPurchase: state.supplierPurchase ?? "0",
  });
}

async function assertRelations(input: CreateOrderInput): Promise<void> {
  const database = getDatabase();
  const [project, supplier, currency, buildings] = await Promise.all([
    database.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, reportingCurrencyCode: true },
    }),
    database.supplier.findUnique({
      where: { id: input.supplierId },
      select: { id: true },
    }),
    database.currency.findFirst({
      where: { code: input.orderCurrencyCode, isActive: true },
      select: { code: true },
    }),
    input.buildingIds.length
      ? database.building.findMany({
          where: { id: { in: input.buildingIds }, projectId: input.projectId },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);
  if (!project) throw new ProcurementRelationError("Choose a valid project.");
  if (!supplier) throw new ProcurementRelationError("Choose a valid supplier.");
  if (!currency)
    throw new ProcurementRelationError("Choose an active currency.");
  if (input.orderCurrencyCode !== project.reportingCurrencyCode) {
    throw new ProcurementRelationError(
      "Phase 4 financials must use the project reporting currency. Multi-currency conversion begins in Phase 5.",
    );
  }
  if (buildings.length !== input.buildingIds.length) {
    throw new ProcurementRelationError(
      "Every selected building must belong to the chosen project.",
    );
  }
  if (input.pricingMode === PricingMode.TARGET_MARGIN) {
    const source = input.financialStates.find(
      (state) => state.state === input.pricingSourceState,
    );
    const sourceCost = source ? inputLandedCost(source) : null;
    if (!sourceCost || !input.targetMarginRate) {
      throw new ProcurementRelationError(
        "Target-margin pricing requires costs in the selected pricing state.",
      );
    }
    packageSellingPriceFromTargetMargin(
      sourceCost,
      input.targetMarginRate,
      input.freightTreatment,
      input.freightResaleAmount ?? "0",
    );
  }
}

function orderData(input: CreateOrderInput) {
  return {
    category: input.category ?? null,
    description: input.description ?? null,
    freightResaleAmount:
      input.freightTreatment === FreightTreatment.RECHARGED_SEPARATELY
        ? (input.freightResaleAmount ?? null)
        : null,
    freightTreatment: input.freightTreatment,
    notes: input.notes ?? null,
    orderCurrencyCode: input.orderCurrencyCode,
    orderNumber: input.orderNumber,
    packageName: input.packageName,
    pricingMode: input.pricingMode,
    pricingSourceState: input.pricingSourceState,
    projectId: input.projectId,
    sellingCurrencyCode: input.orderCurrencyCode,
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

export async function listOrderOptions() {
  const database = getDatabase();
  const [projects, suppliers] = await Promise.all([
    database.project.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        buildings: {
          orderBy: { name: "asc" },
          select: { id: true, isActive: true, name: true, shortCode: true },
        },
        id: true,
        name: true,
        reportingCurrencyCode: true,
      },
    }),
    database.supplier.findMany({
      orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
      select: { displayName: true, id: true },
    }),
  ]);
  return {
    financialStates: Object.values(FinancialState),
    freightTreatments: Object.values(FreightTreatment),
    pricingModes: Object.values(PricingMode),
    projects,
    statuses: Object.values(ProcurementOrderStatus),
    suppliers,
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

async function replaceFinancialStates(
  transaction: Prisma.TransactionClient,
  orderId: string,
  actorId: string,
  input: CreateOrderInput,
): Promise<void> {
  for (const state of input.financialStates) {
    const existing = await transaction.procurementOrderFinancials.findUnique({
      where: { orderId_state: { orderId, state: state.state } },
      select: { id: true },
    });
    if (!existing && !stateHasValues(state)) continue;
    const financial = await transaction.procurementOrderFinancials.upsert({
      where: { orderId_state: { orderId, state: state.state } },
      create: {
        createdById: actorId,
        orderId,
        state: state.state,
        updatedById: actorId,
      },
      update: { updatedById: actorId },
      select: { id: true },
    });
    await transaction.procurementOrderCostLine.deleteMany({
      where: { financialsId: financial.id },
    });
    const lines = costLines(state, input.orderCurrencyCode, actorId);
    if (lines.length) {
      await transaction.procurementOrderCostLine.createMany({
        data: lines.map((line) => ({ ...line, financialsId: financial.id })),
      });
    }
  }
}

export async function createOrder(
  actorId: string,
  input: CreateOrderInput,
): Promise<string> {
  await assertRelations(input);
  return getDatabase().$transaction(async (transaction) => {
    const order = await transaction.procurementOrder.create({
      data: {
        ...orderData(input),
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
    await replaceFinancialStates(transaction, order.id, actorId, input);
    return order.id;
  });
}

export async function updateOrder(
  actorId: string,
  input: UpdateOrderInput,
): Promise<void> {
  await assertRelations(input);
  const { id, ...fields } = input;
  try {
    await getDatabase().$transaction(async (transaction) => {
      await transaction.procurementOrder.update({
        where: { id },
        data: { ...orderData(fields), updatedById: actorId },
      });
      await transaction.procurementOrderBuilding.deleteMany({
        where: { orderId: id },
      });
      if (input.buildingIds.length) {
        await transaction.procurementOrderBuilding.createMany({
          data: input.buildingIds.map((buildingId) => ({
            buildingId,
            createdById: actorId,
            orderId: id,
          })),
        });
      }
      await replaceFinancialStates(transaction, id, actorId, fields);
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
