import "server-only";

import Decimal from "decimal.js";

import {
  ItemCommercialStatus,
  ItemLogisticsStatus,
  Prisma,
  PricingMode,
  type VatRecoverability,
  type VatTreatment,
} from "@/generated/prisma/client";
import {
  budgetPriceFromMarkup,
  calculateItemFinancials,
  itemBudgetVariance,
  reconcileItemFinancialDraft,
} from "@/domain/items/calculations";
import type {
  CreateItemInput,
  CreateLocationInput,
  CreateRoomInput,
  InlineItemFinancialInput,
  InlineItemGeneralInput,
  InlineItemStatusInput,
  InlineItemTrackingInput,
  UpdateLocationInlineInput,
  UpdateRoomInlineInput,
  UpdateItemInput,
} from "@/domain/items/validation";
import { paginationSkip, type PageInput } from "@/domain/listing/validation";
import { deriveVendorPaymentStatus } from "@/domain/payments/calculations";
import { writeAuditEvent } from "@/lib/audit/events";
import { getDatabase } from "@/lib/db";

export class ItemValidationError extends Error {}

export interface ItemListFilters extends PageInput {
  buildingId?: string | undefined;
  category?: string | undefined;
  commercialStatus?: ItemCommercialStatus | undefined;
  currencyCode?: string | undefined;
  direction: "asc" | "desc";
  logisticsStatus?: ItemLogisticsStatus | undefined;
  orderId?: string | undefined;
  projectId?: string | undefined;
  query: string;
  roomId?: string | undefined;
  sort:
    "description" | "estimatedDelivery" | "reference" | "status" | "updated";
  sourceType?: "MANUAL" | "BUDGET_XLSX" | "SUPPLIER_QUOTE_PDF" | undefined;
  supplierId?: string | undefined;
}

const itemInclude = {
  building: { select: { id: true, name: true, shortCode: true } },
  itemImport: {
    select: { id: true, originalFilename: true, importedAt: true },
  },
  procurementOrder: {
    select: {
      id: true,
      orderNumber: true,
      paymentInstallments: {
        where: { direction: "SUPPLIER_PAYMENT" },
        select: {
          isCancelled: true,
          scheduledAmount: true,
          sequence: true,
          settlements: { select: { amount: true } },
        },
      },
    },
  },
  project: {
    select: {
      freightEstimateRate: true,
      id: true,
      name: true,
      reportingCurrencyCode: true,
    },
  },
  purchaseCurrency: { select: { code: true } },
  room: { select: { id: true, name: true } },
  supplier: { select: { displayName: true, id: true } },
} satisfies Prisma.ItemInclude;

function serializeItem(
  item: Prisma.ItemGetPayload<{ include: typeof itemInclude }>,
) {
  const { procurementOrder, project, ...baseItem } = item;
  const financial = calculateItemFinancials({
    pricingMode: item.pricingMode,
    quantity: item.quantity.toString(),
    targetMarginRate: item.targetMarginRate?.toString() ?? null,
    totalPurchasePriceHt: item.totalPurchasePriceHt?.toString() ?? null,
    totalSellingPriceHt: item.totalSellingPriceHt?.toString() ?? null,
    unitPurchasePriceHt: item.unitPurchasePriceHt?.toString() ?? null,
    unitSellingPriceHt: item.unitSellingPriceHt?.toString() ?? null,
    vatAmount: item.vatAmount?.toString() ?? null,
    vatRate: item.vatRate?.toString() ?? null,
  });
  const variance = itemBudgetVariance(
    item.budgetPurchaseTotalPriceHt?.toString() ?? null,
    item.totalPurchasePriceHt?.toString() ?? null,
  );
  const vendorPaymentStatus = procurementOrder
    ? deriveVendorPaymentStatus(procurementOrder.paymentInstallments)
    : "NOT_PAID";
  return {
    ...baseItem,
    claimOpenedDate: dateOnly(item.claimOpenedDate),
    claimResolvedDate: dateOnly(item.claimResolvedDate),
    deliveredResidenceDate: dateOnly(item.deliveredResidenceDate),
    estimatedFabricatorDate: dateOnly(item.estimatedFabricatorDate),
    estimatedResidenceDate: dateOnly(item.estimatedResidenceDate),
    estimatedWarehouseDate: dateOnly(item.estimatedWarehouseDate),
    financial,
    project: {
      ...project,
      freightEstimateRate: project.freightEstimateRate?.toString() ?? null,
    },
    procurementOrder: procurementOrder
      ? { id: procurementOrder.id, orderNumber: procurementOrder.orderNumber }
      : null,
    variance,
    vendorPaymentStatus,
    inTransitDate: dateOnly(item.inTransitDate),
    installedDate: dateOnly(item.installedDate),
    quantity: item.quantity.toString(),
    budgetPurchaseTotalPriceHt:
      item.budgetPurchaseTotalPriceHt?.toString() ?? null,
    budgetPurchaseUnitPriceHt:
      item.budgetPurchaseUnitPriceHt?.toString() ?? null,
    receivedFabricatorDate: dateOnly(item.receivedFabricatorDate),
    receivedWarehouseDate: dateOnly(item.receivedWarehouseDate),
    targetMarginRate: item.targetMarginRate?.toString() ?? null,
    totalPurchasePriceHt: item.totalPurchasePriceHt?.toString() ?? null,
    totalSellingPriceHt: item.totalSellingPriceHt?.toString() ?? null,
    totalVolume: item.totalVolume?.toString() ?? null,
    totalWeight: item.totalWeight?.toString() ?? null,
    unitPurchasePriceHt: item.unitPurchasePriceHt?.toString() ?? null,
    unitSellingPriceHt: item.unitSellingPriceHt?.toString() ?? null,
    vatAmount: item.vatAmount?.toString() ?? null,
    vatRate: item.vatRate?.toString() ?? null,
    volumeEach: item.volumeEach?.toString() ?? null,
    weightEach: item.weightEach?.toString() ?? null,
  };
}
export type ManagedItem = ReturnType<typeof serializeItem>;

function dateOnly(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

function dateValue(value: string | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export async function listItemsPage(filters: ItemListFilters) {
  const query = filters.query.trim();
  const where: Prisma.ItemWhereInput = {
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.buildingId ? { buildingId: filters.buildingId } : {}),
    ...(filters.roomId ? { roomId: filters.roomId } : {}),
    ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
    ...(filters.orderId ? { procurementOrderId: filters.orderId } : {}),
    ...(filters.commercialStatus
      ? { commercialStatus: filters.commercialStatus }
      : {}),
    ...(filters.logisticsStatus
      ? { logisticsStatus: filters.logisticsStatus }
      : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.currencyCode
      ? { purchaseCurrencyCode: filters.currencyCode }
      : {}),
    ...(filters.sourceType ? { sourceType: filters.sourceType } : {}),
    ...(query
      ? {
          OR: [
            { itemReference: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            { supplierSku: { contains: query, mode: "insensitive" } },
            {
              supplier: {
                displayName: { contains: query, mode: "insensitive" },
              },
            },
            { project: { name: { contains: query, mode: "insensitive" } } },
            { building: { name: { contains: query, mode: "insensitive" } } },
            { room: { name: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.ItemOrderByWithRelationInput[] =
    filters.sort === "reference"
      ? [{ itemReference: filters.direction }, { id: "asc" }]
      : filters.sort === "description"
        ? [{ name: filters.direction }, { id: "asc" }]
        : filters.sort === "status"
          ? [
              { commercialStatus: filters.direction },
              { name: "asc" },
              { id: "asc" },
            ]
          : filters.sort === "estimatedDelivery"
            ? [
                {
                  estimatedWarehouseDate: {
                    sort: filters.direction,
                    nulls: "last",
                  },
                },
                { id: "asc" },
              ]
            : [{ updatedAt: filters.direction }, { id: "asc" }];
  const database = getDatabase();
  const [items, total] = await Promise.all([
    database.item.findMany({
      include: itemInclude,
      orderBy,
      skip: paginationSkip(filters),
      take: filters.pageSize,
      where,
    }),
    database.item.count({ where }),
  ]);
  return { items: items.map(serializeItem), total };
}

export async function listItemOptions() {
  const database = getDatabase();
  const [projects, suppliers, currencies, locations, categories, imports] =
    await Promise.all([
      database.project.findMany({
        orderBy: { name: "asc" },
        select: {
          buildings: {
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              projectId: true,
              rooms: {
                where: { isActive: true },
                orderBy: { name: "asc" },
                select: { buildingId: true, id: true, name: true },
              },
            },
            where: { isActive: true },
          },
          id: true,
          name: true,
          reportingCurrencyCode: true,
          orders: {
            orderBy: { orderNumber: "asc" },
            select: { id: true, orderNumber: true, supplierId: true },
          },
        },
        where: { status: { not: "ARCHIVED" } },
      }),
      database.supplier.findMany({
        where: { isActive: true },
        orderBy: { displayName: "asc" },
        select: { id: true, displayName: true, defaultCurrencyCode: true },
      }),
      database.currency.findMany({
        where: { isActive: true },
        orderBy: { code: "asc" },
        select: { code: true, name: true },
      }),
      database.logisticsLocation.findMany({
        where: { isActive: true },
        orderBy: [{ type: "asc" }, { name: "asc" }],
        select: { id: true, name: true, type: true },
      }),
      database.item.findMany({
        distinct: ["category"],
        orderBy: { category: "asc" },
        select: { category: true },
        where: { category: { not: null } },
      }),
      database.itemImport.findMany({
        orderBy: { importedAt: "desc" },
        take: 100,
        select: { id: true, originalFilename: true, projectId: true },
      }),
    ]);
  return {
    categories: categories.flatMap((value) =>
      value.category ? [value.category] : [],
    ),
    currencies,
    imports,
    locations,
    projects,
    suppliers,
  };
}

export async function getItem(id: string) {
  const item = await getDatabase().item.findUnique({
    include: {
      ...itemInclude,
      createdBy: { select: { name: true } },
      updatedBy: { select: { name: true } },
      expectedWarehouse: true,
      receivedWarehouse: true,
      fabricator: true,
      destinationLocation: true,
    },
    where: { id },
  });
  if (!item) return null;
  const {
    createdBy,
    destinationLocation,
    expectedWarehouse,
    fabricator,
    receivedWarehouse,
    updatedBy,
    ...base
  } = item;
  return {
    ...serializeItem(base),
    createdBy,
    destinationLocation,
    expectedWarehouse,
    fabricator,
    receivedWarehouse,
    updatedBy,
  };
}

async function assertRelations(
  transaction: Prisma.TransactionClient,
  input: CreateItemInput,
) {
  const [project, building, room, supplier, order, currency, locationCount] =
    await Promise.all([
      transaction.project.findUnique({
        where: { id: input.projectId },
        select: { id: true },
      }),
      input.buildingId
        ? transaction.building.findFirst({
            where: { id: input.buildingId, projectId: input.projectId },
            select: { id: true },
          })
        : null,
      input.roomId && input.buildingId
        ? transaction.room.findFirst({
            where: { id: input.roomId, buildingId: input.buildingId },
            select: { id: true },
          })
        : null,
      input.supplierId
        ? transaction.supplier.findFirst({
            where: { id: input.supplierId, isActive: true },
            select: { id: true },
          })
        : null,
      input.procurementOrderId
        ? transaction.procurementOrder.findFirst({
            where: {
              id: input.procurementOrderId,
              projectId: input.projectId,
              ...(input.supplierId ? { supplierId: input.supplierId } : {}),
            },
            select: { id: true },
          })
        : null,
      input.purchaseCurrencyCode
        ? transaction.currency.findFirst({
            where: { code: input.purchaseCurrencyCode, isActive: true },
            select: { code: true },
          })
        : null,
      transaction.logisticsLocation.count({
        where: {
          id: {
            in: [
              input.expectedWarehouseId,
              input.receivedWarehouseId,
              input.fabricatorId,
              input.destinationLocationId,
            ].filter((id): id is string => Boolean(id)),
          },
          isActive: true,
        },
      }),
    ]);
  if (!project) throw new ItemValidationError("Choose a valid Project.");
  if (input.buildingId && !building)
    throw new ItemValidationError(
      "The Building must belong to the selected Project.",
    );
  if (input.roomId && !room)
    throw new ItemValidationError(
      "The Room must belong to the selected Building.",
    );
  if (input.supplierId && !supplier)
    throw new ItemValidationError("Choose an active Supplier.");
  if (input.procurementOrderId && !order)
    throw new ItemValidationError(
      "The Order must belong to the selected Project and Supplier.",
    );
  if (input.purchaseCurrencyCode && !currency)
    throw new ItemValidationError("Choose an active currency.");
  const expectedLocations = new Set(
    [
      input.expectedWarehouseId,
      input.receivedWarehouseId,
      input.fabricatorId,
      input.destinationLocationId,
    ].filter(Boolean),
  ).size;
  if (locationCount !== expectedLocations)
    throw new ItemValidationError("Choose active logistics Locations.");
}

function itemData(input: CreateItemInput) {
  const { markupRate, ...persistedInput } = input;
  const markupUnitSelling =
    markupRate && input.unitPurchasePriceHt
      ? budgetPriceFromMarkup(input.unitPurchasePriceHt, markupRate)
      : input.unitSellingPriceHt;
  const markupTotalSelling =
    markupRate && input.totalPurchasePriceHt
      ? budgetPriceFromMarkup(input.totalPurchasePriceHt, markupRate)
      : input.totalSellingPriceHt;
  const financial = calculateItemFinancials({
    pricingMode: input.pricingMode,
    quantity: input.quantity,
    targetMarginRate: input.targetMarginRate ?? null,
    totalPurchasePriceHt: input.totalPurchasePriceHt ?? null,
    totalSellingPriceHt: markupTotalSelling ?? null,
    unitPurchasePriceHt: input.unitPurchasePriceHt ?? null,
    unitSellingPriceHt: markupUnitSelling ?? null,
    vatAmount: input.vatAmount ?? null,
    vatRate: input.vatRate ?? null,
  });
  return {
    ...persistedInput,
    buildingId: input.buildingId ?? null,
    roomId: input.roomId ?? null,
    supplierId: input.supplierId ?? null,
    procurementOrderId: input.procurementOrderId ?? null,
    purchaseCurrencyCode: input.purchaseCurrencyCode ?? null,
    itemReference: input.itemReference ?? null,
    supplierSku: input.supplierSku ?? null,
    description: input.description ?? null,
    category: input.category ?? null,
    brand: input.brand ?? null,
    finishColor: input.finishColor ?? null,
    notes: input.notes ?? null,
    unitPurchasePriceHt: financial.unitPurchasePriceHt,
    totalPurchasePriceHt: financial.totalPurchasePriceHt,
    unitSellingPriceHt: financial.unitSellingPriceHt,
    totalSellingPriceHt: financial.totalSellingPriceHt,
    vatAmount: financial.vatAmount,
    vatRate: input.vatRate ?? null,
    vatTreatment: input.vatTreatment ?? (null as VatTreatment | null),
    vatRecoverability:
      input.vatRecoverability ?? (null as VatRecoverability | null),
    targetMarginRate: input.targetMarginRate ?? null,
    budgetPurchaseUnitPriceHt: input.budgetPurchaseUnitPriceHt ?? null,
    budgetPurchaseTotalPriceHt: input.budgetPurchaseTotalPriceHt ?? null,
    budgetVarianceComment: input.budgetVarianceComment ?? null,
    weightEach: input.weightEach ?? null,
    totalWeight: input.totalWeight ?? null,
    volumeEach: input.volumeEach ?? null,
    totalVolume: input.totalVolume ?? null,
    estimatedWarehouseDate: dateValue(input.estimatedWarehouseDate),
    estimatedFabricatorDate: dateValue(input.estimatedFabricatorDate),
    receivedFabricatorDate: dateValue(input.receivedFabricatorDate),
    receivedWarehouseDate: dateValue(input.receivedWarehouseDate),
    inTransitDate: dateValue(input.inTransitDate),
    estimatedResidenceDate: dateValue(input.estimatedResidenceDate),
    deliveredResidenceDate: dateValue(input.deliveredResidenceDate),
    installedDate: dateValue(input.installedDate),
    expectedWarehouseId: input.expectedWarehouseId ?? null,
    receivedWarehouseId: input.receivedWarehouseId ?? null,
    fabricatorId: input.fabricatorId ?? null,
    destinationLocationId: input.destinationLocationId ?? null,
    issueDescription: input.issueDescription ?? null,
    claimStatus: input.claimStatus ?? null,
    claimOpenedDate: dateValue(input.claimOpenedDate),
    claimResolvedDate: dateValue(input.claimResolvedDate),
    claimNotes: input.claimNotes ?? null,
  };
}

export async function createItem(actorId: string, input: CreateItemInput) {
  return getDatabase().$transaction(async (transaction) => {
    await assertRelations(transaction, input);
    const item = await transaction.item.create({
      data: { ...itemData(input), createdById: actorId, updatedById: actorId },
      select: { id: true, itemReference: true, name: true },
    });
    await writeAuditEvent(transaction, actorId, {
      action: "CREATED",
      entityId: item.id,
      entityReference: item.itemReference ?? item.name,
      entityType: "ITEM",
      summary: "Created the Item.",
    });
    return item.id;
  });
}

export async function updateItem(actorId: string, input: UpdateItemInput) {
  const { id, ...fields } = input;
  return getDatabase().$transaction(async (transaction) => {
    const current = await transaction.item.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!current) throw new ItemValidationError("This Item no longer exists.");
    await assertRelations(transaction, fields);
    const item = await transaction.item.update({
      where: { id },
      data: { ...itemData(fields), updatedById: actorId },
      select: { id: true, itemReference: true, name: true },
    });
    await writeAuditEvent(transaction, actorId, {
      action: "UPDATED",
      entityId: item.id,
      entityReference: item.itemReference ?? item.name,
      entityType: "ITEM",
      summary: "Updated the Item, including financial or operational fields.",
    });
    return item.id;
  });
}

export async function updateItemFinancialInline(
  actorId: string,
  input: InlineItemFinancialInput,
) {
  return getDatabase().$transaction(async (transaction) => {
    const current = await transaction.item.findUnique({
      where: { id: input.id },
      select: { itemReference: true, name: true },
    });
    if (!current) throw new ItemValidationError("This Item no longer exists.");
    const draft = reconcileItemFinancialDraft(input);
    const vat = calculateItemFinancials({
      pricingMode: "SELLING_PRICE",
      quantity: draft.quantity,
      totalPurchasePriceHt: draft.totalPurchase,
      totalSellingPriceHt: draft.budgetTotal,
      unitPurchasePriceHt: draft.unitPurchase,
      unitSellingPriceHt: draft.budgetUnit,
      vatAmount: null,
      vatRate: input.vatRate,
    });
    await transaction.item.update({
      where: { id: input.id },
      data: {
        budgetVarianceComment: input.budgetVarianceComment ?? null,
        pricingMode: PricingMode.SELLING_PRICE,
        quantity: draft.quantity,
        targetMarginRate: null,
        totalPurchasePriceHt: draft.totalPurchase,
        totalSellingPriceHt: draft.budgetTotal,
        unitPurchasePriceHt: draft.unitPurchase,
        unitSellingPriceHt: draft.budgetUnit,
        vatAmount: vat.vatAmount,
        vatRate: input.vatRate,
        vatRecoverability: input.vatRecoverability,
        vatTreatment: input.vatTreatment,
        updatedById: actorId,
      },
    });
    await writeAuditEvent(transaction, actorId, {
      action: "UPDATED",
      entityId: input.id,
      entityReference: current.itemReference ?? current.name,
      entityType: "ITEM",
      metadata: {
        fields: ["quantity", "purchase", "budget", "vat", "varianceComment"],
      },
      summary: "Updated Item financial and budget-comparison values.",
    });
    return {
      ...draft,
      vatAmount: vat.vatAmount,
      vatRate: input.vatRate,
      vatRecoverability: input.vatRecoverability,
      vatTreatment: input.vatTreatment,
    };
  });
}

export async function updateItemGeneralInline(
  actorId: string,
  input: InlineItemGeneralInput,
) {
  return getDatabase().$transaction(async (transaction) => {
    const current = await transaction.item.findUnique({
      where: { id: input.id },
      select: {
        itemReference: true,
        name: true,
        projectId: true,
        totalPurchasePriceHt: true,
        totalSellingPriceHt: true,
        unitPurchasePriceHt: true,
        unitSellingPriceHt: true,
      },
    });
    if (!current) throw new ItemValidationError("This Item no longer exists.");
    const [building, room, supplier] = await Promise.all([
      input.buildingId
        ? transaction.building.findFirst({
            where: {
              id: input.buildingId,
              isActive: true,
              projectId: current.projectId,
            },
            select: { id: true },
          })
        : null,
      input.roomId && input.buildingId
        ? transaction.room.findFirst({
            where: {
              buildingId: input.buildingId,
              id: input.roomId,
              isActive: true,
            },
            select: { id: true },
          })
        : null,
      input.supplierId
        ? transaction.supplier.findFirst({
            where: { id: input.supplierId, isActive: true },
            select: { id: true },
          })
        : null,
    ]);
    if (input.buildingId && !building)
      throw new ItemValidationError(
        "The Building must belong to this Project and remain active.",
      );
    if (input.roomId && !room)
      throw new ItemValidationError(
        "The Room must belong to the selected Building and remain active.",
      );
    if (input.supplierId && !supplier)
      throw new ItemValidationError("Choose an active Supplier.");
    const financial = reconcileItemFinancialDraft({
      basis: "QUANTITY",
      budgetTotal: current.totalSellingPriceHt?.toString() ?? null,
      budgetUnit: current.unitSellingPriceHt?.toString() ?? null,
      markupRate: null,
      quantity: input.quantity,
      totalPurchase: current.totalPurchasePriceHt?.toString() ?? null,
      unitPurchase: current.unitPurchasePriceHt?.toString() ?? null,
    });
    const item = await transaction.item.update({
      where: { id: input.id },
      data: {
        buildingId: input.buildingId ?? null,
        category: input.category ?? null,
        itemReference: input.itemReference ?? null,
        name: input.name,
        quantity: financial.quantity,
        roomId: input.roomId ?? null,
        supplierId: input.supplierId ?? null,
        totalPurchasePriceHt: financial.totalPurchase,
        totalSellingPriceHt: financial.budgetTotal,
        unitOfMeasure: input.unitOfMeasure,
        updatedById: actorId,
      },
      select: {
        buildingId: true,
        category: true,
        itemReference: true,
        name: true,
        quantity: true,
        roomId: true,
        supplierId: true,
        unitOfMeasure: true,
      },
    });
    await writeAuditEvent(transaction, actorId, {
      action: "UPDATED",
      entityId: input.id,
      entityReference: item.itemReference ?? item.name,
      entityType: "ITEM",
      metadata: {
        fields: [
          "itemReference",
          "name",
          "supplierId",
          "buildingId",
          "roomId",
          "quantity",
          "unitOfMeasure",
          "category",
        ],
      },
      summary: "Updated routine Item fields from the Items table.",
    });
    return { ...item, quantity: item.quantity.toString() };
  });
}

export async function updateItemStatusInline(
  actorId: string,
  input: InlineItemStatusInput,
) {
  return getDatabase().$transaction(async (transaction) => {
    const current = await transaction.item.findUnique({
      where: { id: input.id },
      select: { itemReference: true, name: true },
    });
    if (!current) throw new ItemValidationError("This Item no longer exists.");
    await transaction.item.update({
      where: { id: input.id },
      data: {
        commercialStatus: input.commercialStatus,
        logisticsStatus: input.logisticsStatus,
        updatedById: actorId,
      },
    });
    await writeAuditEvent(transaction, actorId, {
      action: "UPDATED",
      entityId: input.id,
      entityReference: current.itemReference ?? current.name,
      entityType: "ITEM",
      metadata: { fields: ["commercialStatus", "logisticsStatus"] },
      summary: "Updated Item commercial and logistics status.",
    });
  });
}

export async function updateItemTrackingInline(
  actorId: string,
  input: InlineItemTrackingInput,
) {
  return getDatabase().$transaction(async (transaction) => {
    const current = await transaction.item.findUnique({
      where: { id: input.id },
      select: { itemReference: true, name: true },
    });
    if (!current) throw new ItemValidationError("This Item no longer exists.");
    const locationIds = [
      input.expectedWarehouseId,
      input.receivedWarehouseId,
      input.fabricatorId,
    ].filter((id): id is string => Boolean(id));
    const activeLocationCount = await transaction.logisticsLocation.count({
      where: { id: { in: [...new Set(locationIds)] }, isActive: true },
    });
    if (activeLocationCount !== new Set(locationIds).size)
      throw new ItemValidationError("Choose active logistics Locations.");
    await transaction.item.update({
      where: { id: input.id },
      data: {
        deliveredResidenceDate: dateValue(input.deliveredResidenceDate),
        estimatedFabricatorDate: dateValue(input.estimatedFabricatorDate),
        estimatedResidenceDate: dateValue(input.estimatedResidenceDate),
        estimatedWarehouseDate: dateValue(input.estimatedWarehouseDate),
        expectedWarehouseId: input.expectedWarehouseId ?? null,
        fabricatorId: input.fabricatorId ?? null,
        inTransitDate: dateValue(input.inTransitDate),
        installedDate: dateValue(input.installedDate),
        logisticsStatus: input.logisticsStatus,
        receivedFabricatorDate: dateValue(input.receivedFabricatorDate),
        receivedWarehouseDate: dateValue(input.receivedWarehouseDate),
        receivedWarehouseId: input.receivedWarehouseId ?? null,
        updatedById: actorId,
      },
    });
    await writeAuditEvent(transaction, actorId, {
      action: "UPDATED",
      entityId: input.id,
      entityReference: current.itemReference ?? current.name,
      entityType: "ITEM",
      metadata: { fields: ["logisticsStatus", "locations", "trackingDates"] },
      summary: "Updated Item logistics tracking.",
    });
  });
}

export interface BulkItemUpdate {
  buildingId?: string | null | undefined;
  category?: string | null | undefined;
  commercialStatus?: ItemCommercialStatus | undefined;
  logisticsStatus?: ItemLogisticsStatus | undefined;
  projectId?: string | undefined;
  roomId?: string | null | undefined;
  supplierId?: string | null | undefined;
  vatRate?: string | null | undefined;
}

export async function bulkUpdateItems(
  actorId: string,
  ids: string[],
  changes: BulkItemUpdate,
) {
  await getDatabase().$transaction(
    async (transaction) => {
      const items = await transaction.item.findMany({
        where: { id: { in: ids } },
        select: { id: true, projectId: true },
      });
      if (items.length !== ids.length)
        throw new ItemValidationError("One or more Items no longer exist.");
      const targetProjectId = changes.projectId ?? items[0]?.projectId;
      if (
        !targetProjectId ||
        (!changes.projectId &&
          new Set(items.map((item) => item.projectId)).size > 1 &&
          (changes.buildingId || changes.roomId))
      )
        throw new ItemValidationError(
          "Select Items from one Project before assigning a Building or Room.",
        );
      const relationInput = {
        projectId: targetProjectId,
        buildingId: changes.buildingId ?? undefined,
        roomId: changes.roomId ?? undefined,
        supplierId: changes.supplierId ?? undefined,
        commercialStatus: ItemCommercialStatus.BUDGET,
        logisticsStatus: ItemLogisticsStatus.PENDING,
        name: "validation",
        pricingMode: PricingMode.SELLING_PRICE,
        quantity: "1.0000",
        unitOfMeasure: "EA",
      } satisfies CreateItemInput;
      await assertRelations(transaction, relationInput);
      const update: Prisma.ItemUncheckedUpdateManyInput = {
        ...(changes.buildingId !== undefined
          ? { buildingId: changes.buildingId }
          : {}),
        ...(changes.category !== undefined
          ? { category: changes.category }
          : {}),
        ...(changes.commercialStatus !== undefined
          ? { commercialStatus: changes.commercialStatus }
          : {}),
        ...(changes.logisticsStatus !== undefined
          ? { logisticsStatus: changes.logisticsStatus }
          : {}),
        ...(changes.projectId !== undefined
          ? { projectId: changes.projectId }
          : {}),
        ...(changes.roomId !== undefined ? { roomId: changes.roomId } : {}),
        ...(changes.supplierId !== undefined
          ? { supplierId: changes.supplierId }
          : {}),
        ...(changes.vatRate !== undefined ? { vatRate: changes.vatRate } : {}),
        ...(changes.projectId
          ? {
              buildingId: changes.buildingId ?? null,
              procurementOrderId: null,
              roomId: changes.roomId ?? null,
            }
          : {}),
        updatedById: actorId,
      };
      await transaction.item.updateMany({
        where: { id: { in: ids } },
        data: update,
      });
      await writeAuditEvent(transaction, actorId, {
        action: "UPDATED",
        entityReference: `${ids.length} Items`,
        entityType: "ITEM",
        metadata: { ids, fields: Object.keys(changes) },
        summary: "Bulk-updated selected Items.",
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function deleteItems(actorId: string, ids: string[]) {
  await getDatabase().$transaction(
    async (transaction) => {
      const items = await transaction.item.findMany({
        where: { id: { in: ids } },
        select: { id: true, itemReference: true, name: true },
      });
      if (items.length !== ids.length)
        throw new ItemValidationError("One or more Items no longer exist.");
      for (const item of items)
        await writeAuditEvent(transaction, actorId, {
          action: "DELETED",
          entityId: item.id,
          entityReference: item.itemReference ?? item.name,
          entityType: "ITEM",
          summary: "Permanently deleted the Item.",
        });
      await transaction.item.deleteMany({ where: { id: { in: ids } } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function createRoom(actorId: string, input: CreateRoomInput) {
  return getDatabase().$transaction(async (transaction) => {
    const building = await transaction.building.findUnique({
      where: { id: input.buildingId },
      select: { id: true },
    });
    if (!building) throw new ItemValidationError("Choose a valid Building.");
    const room = await transaction.room.create({
      data: {
        ...input,
        code: input.code ?? null,
        notes: input.notes ?? null,
        createdById: actorId,
        updatedById: actorId,
      },
      select: { id: true, name: true },
    });
    await writeAuditEvent(transaction, actorId, {
      action: "CREATED",
      entityId: room.id,
      entityReference: room.name,
      entityType: "ROOM",
      summary: "Created the Room.",
    });
    return room;
  });
}

export async function createLogisticsLocation(
  actorId: string,
  input: CreateLocationInput,
) {
  return getDatabase().$transaction(async (transaction) => {
    const location = await transaction.logisticsLocation.create({
      data: {
        ...input,
        addressLine1: input.addressLine1 ?? null,
        addressLine2: input.addressLine2 ?? null,
        city: input.city ?? null,
        countryCode: input.countryCode ?? null,
        notes: input.notes ?? null,
        postalCode: input.postalCode ?? null,
        createdById: actorId,
        updatedById: actorId,
      },
      select: { id: true, name: true },
    });
    await writeAuditEvent(transaction, actorId, {
      action: "CREATED",
      entityId: location.id,
      entityReference: location.name,
      entityType: "LOGISTICS_LOCATION",
      summary: "Created the logistics Location.",
    });
    return location;
  });
}

export async function updateRoomInline(
  actorId: string,
  input: UpdateRoomInlineInput,
) {
  try {
    return await getDatabase().$transaction(async (transaction) => {
      const room = await transaction.room.update({
        where: { id: input.id },
        data: {
          code: input.code ?? null,
          isActive: input.isActive,
          name: input.name,
          updatedById: actorId,
        },
        select: { code: true, id: true, isActive: true, name: true },
      });
      await writeAuditEvent(transaction, actorId, {
        action: "UPDATED",
        entityId: room.id,
        entityReference: room.name,
        entityType: "ROOM",
        metadata: { fields: ["code", "name", "isActive"] },
        summary: "Updated the Room from the Project table.",
      });
      return room;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    )
      throw new ItemValidationError("This Room no longer exists.");
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new ItemValidationError(
        "A Room in this Building already uses that name or code.",
      );
    throw error;
  }
}

export async function updateLocationInline(
  actorId: string,
  input: UpdateLocationInlineInput,
) {
  try {
    return await getDatabase().$transaction(async (transaction) => {
      const location = await transaction.logisticsLocation.update({
        where: { id: input.id },
        data: {
          countryCode: input.countryCode ?? null,
          isActive: input.isActive,
          name: input.name,
          type: input.type,
          updatedById: actorId,
        },
        select: {
          countryCode: true,
          id: true,
          isActive: true,
          name: true,
          type: true,
        },
      });
      await writeAuditEvent(transaction, actorId, {
        action: "UPDATED",
        entityId: location.id,
        entityReference: location.name,
        entityType: "LOGISTICS_LOCATION",
        metadata: { fields: ["name", "type", "countryCode", "isActive"] },
        summary: "Updated the logistics Location from Settings.",
      });
      return location;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    )
      throw new ItemValidationError("This Location no longer exists.");
    throw error;
  }
}

export async function listLogisticsLocations() {
  return getDatabase().logisticsLocation.findMany({
    orderBy: [{ isActive: "desc" }, { type: "asc" }, { name: "asc" }],
    select: {
      city: true,
      countryCode: true,
      id: true,
      isActive: true,
      name: true,
      type: true,
    },
  });
}

export async function projectItemSummary(projectId: string) {
  const project = await getDatabase().project.findUnique({
    where: { id: projectId },
    select: { reportingCurrencyCode: true },
  });
  const items = await getDatabase().item.findMany({
    where: { projectId },
    select: {
      commercialStatus: true,
      purchaseCurrencyCode: true,
      totalPurchasePriceHt: true,
      totalSellingPriceHt: true,
    },
  });
  let purchase = new Decimal(0);
  let selling = new Decimal(0);
  const byStatus: Record<string, number> = {};
  let complete = Boolean(project);
  for (const item of items) {
    if (
      (item.totalPurchasePriceHt || item.totalSellingPriceHt) &&
      item.purchaseCurrencyCode !== project?.reportingCurrencyCode
    )
      complete = false;
    if (item.purchaseCurrencyCode === project?.reportingCurrencyCode) {
      if (item.totalPurchasePriceHt)
        purchase = purchase.plus(item.totalPurchasePriceHt.toString());
      if (item.totalSellingPriceHt)
        selling = selling.plus(item.totalSellingPriceHt.toString());
    }
    byStatus[item.commercialStatus] =
      (byStatus[item.commercialStatus] ?? 0) + 1;
  }
  return {
    byStatus,
    complete,
    count: items.length,
    purchase: complete ? purchase.toFixed(4) : null,
    selling: complete ? selling.toFixed(4) : null,
  };
}
