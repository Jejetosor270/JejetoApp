import "server-only";

import {
  ProcurementOrderStatus,
  ProjectStatus,
} from "@/generated/prisma/client";
import { billingStatuses } from "@/domain/billing/status";
import type { AssistantListQuery } from "@/domain/assistant/lists";
import { formatEnumLabel } from "@/domain/presentation/labels";
import { formatDateOnly } from "@/domain/payments/dates";

export function unsupportedListFilters(
  query: AssistantListQuery,
): string | null {
  const hasDates = Boolean(query.dateFrom || query.dateTo || query.dateField);
  const project = Boolean(query.project || query.projectId);
  const supplier = Boolean(query.supplier || query.supplierId);
  const client = Boolean(query.client || query.clientId);
  if (hasDates && !(query.dateFrom || query.dateTo))
    return "Give a start or end date for this filter.";
  if (hasDates && !query.dateField)
    return "Which date should I use: Order date, Invoice date, or payment due date?";
  if (query.kind === "Order") {
    if (client || query.documentType || query.active)
      return "Orders support Project, Supplier, delivery status, payment status and date filters. Try one of those.";
    if (
      query.status &&
      !Object.values(ProcurementOrderStatus).some(
        (value) => value === query.status,
      )
    )
      return "Choose an existing Order delivery status, or ask for a payment status separately.";
    return null;
  }
  if (query.kind === "Billing") {
    if (supplier || query.active || query.dateField === "orderDate")
      return "Billing supports Project, Client, document type, status, Invoice date and payment due date filters.";
    if (
      query.status &&
      query.status !== "ISSUED" &&
      !billingStatuses.some((value) => value === query.status)
    )
      return "Choose an existing Billing status, or ask for unpaid Invoices.";
    if (query.paymentStatus && query.documentType === "QUOTE")
      return "Payment-status lists use issued Invoices. Quotes are planned Billing; remove the payment filter to list them.";
    if (query.status === "ISSUED" && query.documentType === "QUOTE")
      return "Issued lists use Client Invoices. Remove the issued filter to list Quotes.";
    return null;
  }
  if (query.kind === "Project") {
    if (
      project ||
      supplier ||
      hasDates ||
      query.paymentStatus ||
      query.documentType ||
      query.active
    )
      return "Projects support Client, Project status and name filters. Try one of those.";
    if (
      query.status &&
      !Object.values(ProjectStatus).some((value) => value === query.status)
    )
      return "Choose an existing Project status: Planning, Active, On hold, Completed or Archived.";
    return null;
  }
  return project ||
    supplier ||
    client ||
    hasDates ||
    query.status ||
    query.paymentStatus ||
    query.documentType
    ? "Client and Supplier lists support name and active/inactive filters. Related records can be listed by Project, Supplier or Client."
    : null;
}

export function listFilterLabels(query: AssistantListQuery): string[] {
  return [
    query.query ? `Search: ${query.query}` : null,
    query.project ? `Project: ${query.project}` : null,
    query.supplier ? `Supplier: ${query.supplier}` : null,
    query.client ? `Client: ${query.client}` : null,
    query.status === "ISSUED"
      ? "Issued Invoices"
      : query.status
        ? `${query.kind === "Order" ? "Delivery" : "Status"}: ${formatEnumLabel(query.status)}`
        : null,
    query.paymentStatus
      ? `Payment: ${formatEnumLabel(query.paymentStatus)}`
      : null,
    query.documentType ? formatEnumLabel(query.documentType) : null,
    query.active ? formatEnumLabel(query.active) : null,
    query.dateField
      ? `${query.dateField === "dueDate" ? "Due date" : query.dateField === "orderDate" ? "Order date" : "Invoice date"}: ${query.dateFrom ? formatDateOnly(query.dateFrom) : "Any"} – ${query.dateTo ? formatDateOnly(query.dateTo) : "Any"}`
      : null,
  ].filter((label): label is string => label !== null);
}

/** Do not link to a broader list when its URL cannot represent our exact filters. */
export function assistantListHref(query: AssistantListQuery): string | null {
  if (
    query.paymentStatus ||
    query.status === "ISSUED" ||
    ((query.dateFrom || query.dateTo) &&
      !(query.kind === "Order" && query.dateField === "orderDate"))
  )
    return null;
  const params = new URLSearchParams({
    pageSize: "25",
    sort:
      query.kind === "Client" ||
      query.kind === "Supplier" ||
      query.kind === "Project"
        ? "name"
        : "updated",
    direction:
      query.kind === "Client" ||
      query.kind === "Supplier" ||
      query.kind === "Project"
        ? "asc"
        : "desc",
  });
  for (const key of [
    "query",
    "projectId",
    "supplierId",
    "clientId",
    "status",
    "documentType",
    "dateFrom",
    "dateTo",
    "active",
  ] as const) {
    const value = query[key];
    if (value) params.set(key, value);
  }
  const route = {
    Project: "projects",
    Order: "orders",
    Billing: "billing",
    Client: "clients",
    Supplier: "suppliers",
  }[query.kind];
  return `/${route}?${params.toString()}`;
}

export function dateInListRange(
  date: string | null,
  query: AssistantListQuery,
): boolean {
  if (!query.dateFrom && !query.dateTo) return true;
  return (
    date !== null &&
    (!query.dateFrom || date >= query.dateFrom) &&
    (!query.dateTo || date <= query.dateTo)
  );
}
