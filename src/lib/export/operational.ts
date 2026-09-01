import "server-only";

import {
  ItemCommercialStatus,
  ItemLogisticsStatus,
  ItemSourceType,
  PaymentDirection,
  Prisma,
  ProcurementOrderStatus,
  ProjectStatus,
  VatTreatment,
} from "@/generated/prisma/client";
import {
  csvDocument,
  trustedCsvValue,
  type CsvCell,
} from "@/domain/export/csv";
import {
  firstQueryValue,
  optionalUuid,
  selectedValue,
} from "@/domain/listing/validation";
import type { DerivedPaymentStatus } from "@/domain/payments/calculations";
import { isDateOnly } from "@/domain/payments/dates";
import { getDatabase } from "@/lib/db";
import { listPaymentInstallments } from "@/lib/payments/payments";
import { listOrders } from "@/lib/procurement/orders";

export const exportEntities = [
  "orders",
  "payments",
  "suppliers",
  "clients",
  "projects",
  "items",
  "billing",
  "client-receipts",
] as const;
export type ExportEntity = (typeof exportEntities)[number];

type Params = Record<string, string | string[] | undefined>;

function activeFilter(value: string | undefined) {
  return value === "inactive" || value === "all" ? value : "active";
}

function money(value: string | null): CsvCell {
  return value === null ? "" : trustedCsvValue(value);
}

async function ordersCsv(params: Params): Promise<string> {
  const dateFrom = firstQueryValue(params, "dateFrom");
  const dateTo = firstQueryValue(params, "dateTo");
  const items = await listOrders({
    buildingId: optionalUuid(firstQueryValue(params, "buildingId")),
    currencyCode: firstQueryValue(params, "currencyCode"),
    dateFrom: dateFrom && isDateOnly(dateFrom) ? dateFrom : undefined,
    dateTo: dateTo && isDateOnly(dateTo) ? dateTo : undefined,
    projectId: optionalUuid(firstQueryValue(params, "projectId")),
    query: firstQueryValue(params, "query") ?? "",
    status: selectedValue(
      Object.values(ProcurementOrderStatus),
      firstQueryValue(params, "status"),
    ),
    supplierId: optionalUuid(firstQueryValue(params, "supplierId")),
    vatTreatment: selectedValue(
      Object.values(VatTreatment),
      firstQueryValue(params, "vatTreatment"),
    ),
  });
  return csvDocument(
    [
      "Order reference",
      "Package",
      "Project",
      "Supplier",
      "Status",
      "Purchase currency",
      "Economic landed cost HT",
      "Selling currency",
      "Selling revenue HT",
      "Gross profit",
      "Order date",
    ],
    items.map((item) => [
      item.orderNumber,
      item.packageName,
      item.project.name,
      item.supplier.displayName,
      trustedCsvValue(item.status),
      trustedCsvValue(item.orderCurrencyCode),
      money(item.costs.economicLandedCost),
      trustedCsvValue(item.sellingCurrencyCode),
      money(item.totalSellingRevenue),
      money(item.costs.grossProfit),
      item.orderDate ? trustedCsvValue(item.orderDate) : "",
    ]),
  );
}

const statuses: readonly DerivedPaymentStatus[] = [
  "OVERDUE",
  "DUE",
  "PARTIALLY_PAID",
  "UPCOMING",
  "PAID",
  "CANCELLED",
];

async function paymentsCsv(params: Params): Promise<string> {
  const dueFrom = firstQueryValue(params, "dueFrom");
  const dueTo = firstQueryValue(params, "dueTo");
  const items = await listPaymentInstallments({
    clientId: optionalUuid(firstQueryValue(params, "clientId")),
    currencyCode: firstQueryValue(params, "currencyCode"),
    direction: selectedValue(
      Object.values(PaymentDirection),
      firstQueryValue(params, "direction"),
    ),
    dueFrom: dueFrom && isDateOnly(dueFrom) ? dueFrom : undefined,
    dueTo: dueTo && isDateOnly(dueTo) ? dueTo : undefined,
    projectId: optionalUuid(firstQueryValue(params, "projectId")),
    status: selectedValue(statuses, firstQueryValue(params, "status")),
    supplierId: optionalUuid(firstQueryValue(params, "supplierId")),
  });
  return csvDocument(
    [
      "Direction",
      "Due date",
      "Project",
      "Order",
      "Party",
      "Installment",
      "Scheduled amount",
      "Settled amount",
      "Outstanding amount",
      "Currency",
      "Status",
    ],
    items.map((item) => [
      trustedCsvValue(item.direction),
      trustedCsvValue(item.dueDate),
      item.projectName,
      item.orderNumber,
      item.direction === PaymentDirection.SUPPLIER_PAYMENT
        ? item.supplierName
        : item.clientName,
      item.label,
      money(item.scheduledAmount),
      money(item.paidAmount),
      money(item.outstandingAmount),
      trustedCsvValue(item.currencyCode),
      trustedCsvValue(item.status),
    ]),
  );
}

async function directoryCsv(
  entity: "clients" | "suppliers",
  params: Params,
): Promise<string> {
  const active = activeFilter(firstQueryValue(params, "active"));
  const query = firstQueryValue(params, "query")?.trim() ?? "";
  const countryCode = firstQueryValue(params, "countryCode");
  const currencyCode = firstQueryValue(params, "currencyCode");
  const where = {
    ...(active === "all" ? {} : { isActive: active === "active" }),
    ...(countryCode ? { countryCode } : {}),
    ...(currencyCode ? { defaultCurrencyCode: currencyCode } : {}),
    ...(query
      ? {
          OR: [
            { displayName: { contains: query, mode: "insensitive" as const } },
            { legalName: { contains: query, mode: "insensitive" as const } },
            { vatNumber: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const database = getDatabase();
  const items =
    entity === "clients"
      ? await database.client.findMany({
          orderBy: [{ displayName: "asc" }, { id: "asc" }],
          select: {
            countryCode: true,
            defaultCurrencyCode: true,
            displayName: true,
            email: true,
            isActive: true,
            legalName: true,
            vatNumber: true,
          },
          where,
        })
      : await database.supplier.findMany({
          orderBy: [{ displayName: "asc" }, { id: "asc" }],
          select: {
            countryCode: true,
            defaultCurrencyCode: true,
            displayName: true,
            email: true,
            isActive: true,
            legalName: true,
            vatNumber: true,
          },
          where,
        });
  return csvDocument(
    [
      "Display name",
      "Legal name",
      "Country",
      "VAT number",
      "Default currency",
      "Email",
      "Active",
    ],
    items.map((item) => [
      item.displayName,
      item.legalName,
      item.countryCode ?? "",
      item.vatNumber ?? "",
      trustedCsvValue(item.defaultCurrencyCode),
      item.email ?? "",
      trustedCsvValue(item.isActive ? "true" : "false"),
    ]),
  );
}

async function projectsCsv(params: Params): Promise<string> {
  const query = firstQueryValue(params, "query")?.trim() ?? "";
  const status = selectedValue(
    Object.values(ProjectStatus),
    firstQueryValue(params, "status"),
  );
  const clientId = optionalUuid(firstQueryValue(params, "clientId"));
  const countryCode = firstQueryValue(params, "countryCode");
  const currencyCode = firstQueryValue(params, "currencyCode");
  const where: Prisma.ProjectWhereInput = {
    ...(clientId ? { clientId } : {}),
    ...(countryCode ? { countryCode } : {}),
    ...(currencyCode ? { reportingCurrencyCode: currencyCode } : {}),
    ...(status ? { status } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { code: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const items = await getDatabase().project.findMany({
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      client: { select: { displayName: true } },
      clientBudgetTargetHt: true,
      code: true,
      countryCode: true,
      expectedCompletionDate: true,
      estimatedFreightCostHt: true,
      estimatedPurchaseCostHt: true,
      expectedSellHt: true,
      name: true,
      reportingCurrencyCode: true,
      status: true,
      targetMarkupRate: true,
    },
    where,
  });
  return csvDocument(
    [
      "Project",
      "Code",
      "Client",
      "Country",
      "Reporting currency",
      "Status",
      "Expected completion date",
      "Client budget target HT",
      "Estimated purchase cost HT",
      "Estimated freight cost HT",
      "Target markup rate",
      "Expected sell HT",
    ],
    items.map((item) => [
      item.name,
      item.code,
      item.client.displayName,
      item.countryCode ?? "",
      trustedCsvValue(item.reportingCurrencyCode),
      trustedCsvValue(item.status),
      item.expectedCompletionDate
        ? trustedCsvValue(
            item.expectedCompletionDate.toISOString().slice(0, 10),
          )
        : "",
      money(item.clientBudgetTargetHt?.toString() ?? null),
      money(item.estimatedPurchaseCostHt?.toString() ?? null),
      money(item.estimatedFreightCostHt?.toString() ?? null),
      item.targetMarkupRate
        ? trustedCsvValue(item.targetMarkupRate.toString())
        : "",
      money(item.expectedSellHt?.toString() ?? null),
    ]),
  );
}

async function itemsCsv(params: Params): Promise<string> {
  const query = firstQueryValue(params, "query")?.trim() ?? "";
  const projectId = optionalUuid(firstQueryValue(params, "projectId"));
  const buildingId = optionalUuid(firstQueryValue(params, "buildingId"));
  const roomId = optionalUuid(firstQueryValue(params, "roomId"));
  const supplierId = optionalUuid(firstQueryValue(params, "supplierId"));
  const orderId = optionalUuid(firstQueryValue(params, "orderId"));
  const commercialStatus = selectedValue(
    Object.values(ItemCommercialStatus),
    firstQueryValue(params, "commercialStatus"),
  );
  const logisticsStatus = selectedValue(
    Object.values(ItemLogisticsStatus),
    firstQueryValue(params, "logisticsStatus"),
  );
  const sourceType = selectedValue(
    Object.values(ItemSourceType),
    firstQueryValue(params, "sourceType"),
  );
  const category = firstQueryValue(params, "category");
  const itemCurrencyCode = firstQueryValue(params, "currencyCode");
  const where: Prisma.ItemWhereInput = {
    ...(projectId ? { projectId } : {}),
    ...(buildingId ? { buildingId } : {}),
    ...(roomId ? { roomId } : {}),
    ...(supplierId ? { supplierId } : {}),
    ...(orderId ? { procurementOrderId: orderId } : {}),
    ...(commercialStatus ? { commercialStatus } : {}),
    ...(logisticsStatus ? { logisticsStatus } : {}),
    ...(sourceType ? { sourceType } : {}),
    ...(category ? { category } : {}),
    ...(itemCurrencyCode ? { purchaseCurrencyCode: itemCurrencyCode } : {}),
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
  const items = await getDatabase().item.findMany({
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: {
      building: { select: { name: true } },
      category: true,
      commercialStatus: true,
      estimatedWarehouseDate: true,
      itemReference: true,
      logisticsStatus: true,
      name: true,
      procurementOrder: { select: { orderNumber: true } },
      project: { select: { name: true } },
      purchaseCurrencyCode: true,
      quantity: true,
      room: { select: { name: true } },
      sourceType: true,
      supplier: { select: { displayName: true } },
      supplierSku: true,
      totalPurchasePriceHt: true,
      totalSellingPriceHt: true,
      unitOfMeasure: true,
      unitPurchasePriceHt: true,
      updatedAt: true,
      vatAmount: true,
      vatRate: true,
    },
    where,
  });
  return csvDocument(
    [
      "Item reference",
      "Description",
      "Project",
      "Building",
      "Room",
      "Supplier",
      "Supplier SKU",
      "Order",
      "Commercial status",
      "Logistics status",
      "Quantity",
      "U/M",
      "Unit purchase HT",
      "Purchase total HT",
      "Selling total HT",
      "Currency",
      "VAT rate",
      "VAT amount",
      "Estimated warehouse date",
      "Source",
      "Updated",
    ],
    items.map((item) => [
      item.itemReference ?? "",
      item.name,
      item.project.name,
      item.building?.name ?? "",
      item.room?.name ?? "",
      item.supplier?.displayName ?? "",
      item.supplierSku ?? "",
      item.procurementOrder?.orderNumber ?? "",
      trustedCsvValue(item.commercialStatus),
      trustedCsvValue(item.logisticsStatus),
      trustedCsvValue(item.quantity.toString()),
      item.unitOfMeasure,
      money(item.unitPurchasePriceHt?.toString() ?? null),
      money(item.totalPurchasePriceHt?.toString() ?? null),
      money(item.totalSellingPriceHt?.toString() ?? null),
      item.purchaseCurrencyCode
        ? trustedCsvValue(item.purchaseCurrencyCode)
        : "",
      item.vatRate ? trustedCsvValue(item.vatRate.toString()) : "",
      money(item.vatAmount?.toString() ?? null),
      item.estimatedWarehouseDate
        ? trustedCsvValue(
            item.estimatedWarehouseDate.toISOString().slice(0, 10),
          )
        : "",
      trustedCsvValue(item.sourceType),
      trustedCsvValue(item.updatedAt.toISOString()),
    ]),
  );
}

async function billingCsv(params: Params): Promise<string> {
  const query = firstQueryValue(params, "query")?.trim() ?? "";
  const clientId = optionalUuid(firstQueryValue(params, "clientId"));
  const projectId = optionalUuid(firstQueryValue(params, "projectId"));
  const documentType = firstQueryValue(params, "documentType");
  const items = await getDatabase().clientBillingDocument.findMany({
    where: {
      ...(clientId ? { clientId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(documentType === "QUOTE" || documentType === "INVOICE"
        ? { documentType }
        : {}),
      ...(query
        ? {
            OR: [
              { reference: { contains: query, mode: "insensitive" } },
              {
                client: {
                  displayName: { contains: query, mode: "insensitive" },
                },
              },
              { project: { name: { contains: query, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: [{ documentDate: "desc" }, { id: "asc" }],
    select: {
      client: { select: { displayName: true } },
      currencyCode: true,
      documentDate: true,
      documentType: true,
      dueDate: true,
      fxRateToReporting: true,
      project: { select: { name: true, reportingCurrencyCode: true } },
      reference: true,
      totalHt: true,
      totalTtc: true,
      vatAmount: true,
    },
  });
  return csvDocument(
    [
      "Client",
      "Project",
      "Type",
      "Reference",
      "Document date",
      "Due date",
      "Currency",
      "HT",
      "VAT",
      "TTC",
      "FX to Project currency",
      "Project currency",
    ],
    items.map((item) => [
      item.client.displayName,
      item.project.name,
      trustedCsvValue(item.documentType),
      item.reference,
      trustedCsvValue(item.documentDate.toISOString().slice(0, 10)),
      item.dueDate
        ? trustedCsvValue(item.dueDate.toISOString().slice(0, 10))
        : "",
      trustedCsvValue(item.currencyCode),
      money(item.totalHt.toString()),
      money(item.vatAmount.toString()),
      money(item.totalTtc.toString()),
      item.fxRateToReporting
        ? trustedCsvValue(item.fxRateToReporting.toString())
        : "",
      trustedCsvValue(item.project.reportingCurrencyCode),
    ]),
  );
}

async function clientReceiptsCsv(): Promise<string> {
  const items = await getDatabase().clientReceipt.findMany({
    orderBy: [{ receivedAt: "desc" }, { id: "asc" }],
    select: {
      amount: true,
      fxRateToReporting: true,
      installment: {
        select: {
          billingDocument: {
            select: {
              client: { select: { displayName: true } },
              project: { select: { name: true, reportingCurrencyCode: true } },
              reference: true,
            },
          },
          currencyCode: true,
          label: true,
        },
      },
      receivedAt: true,
      reference: true,
    },
  });
  return csvDocument(
    [
      "Client",
      "Project",
      "Document",
      "Installment",
      "Payment reference",
      "Received date",
      "Amount",
      "Currency",
      "Actual FX",
      "Project currency",
    ],
    items.map((item) => [
      item.installment.billingDocument.client.displayName,
      item.installment.billingDocument.project.name,
      item.installment.billingDocument.reference,
      item.installment.label,
      item.reference ?? "",
      trustedCsvValue(item.receivedAt.toISOString().slice(0, 10)),
      money(item.amount.toString()),
      trustedCsvValue(item.installment.currencyCode),
      item.fxRateToReporting
        ? trustedCsvValue(item.fxRateToReporting.toString())
        : "",
      trustedCsvValue(
        item.installment.billingDocument.project.reportingCurrencyCode,
      ),
    ]),
  );
}

export async function operationalCsv(
  entity: ExportEntity,
  params: Params,
): Promise<string> {
  if (entity === "orders") return ordersCsv(params);
  if (entity === "payments") return paymentsCsv(params);
  if (entity === "projects") return projectsCsv(params);
  if (entity === "items") return itemsCsv(params);
  if (entity === "billing") return billingCsv(params);
  if (entity === "client-receipts") return clientReceiptsCsv();
  return directoryCsv(entity, params);
}
