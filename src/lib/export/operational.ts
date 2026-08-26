import "server-only";

import {
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
      code: true,
      countryCode: true,
      expectedCompletionDate: true,
      name: true,
      reportingCurrencyCode: true,
      status: true,
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
  return directoryCsv(entity, params);
}
