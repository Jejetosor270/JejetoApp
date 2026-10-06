import "server-only";

import Decimal from "decimal.js";
import {
  ProcurementOrderStatus,
  ProjectStatus,
} from "@/generated/prisma/client";
import type {
  AssistantRecord,
  AssistantReply,
} from "@/domain/assistant/contracts";
import {
  ASSISTANT_DERIVED_SCOPE_LIMIT,
  ASSISTANT_LIST_PAGE_SIZE,
  assistantListPageSchema,
  type AssistantListPage,
  type AssistantListQuery,
} from "@/domain/assistant/lists";
import { billingIsIssued } from "@/domain/billing/status";
import { recordPaymentStatusLabel } from "@/domain/payments/record-status";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatEnumLabel } from "@/domain/presentation/labels";
import { listOrdersPage, type OrderSummary } from "@/lib/procurement/orders";
import {
  listClientBillingPage,
  type ClientBillingView,
} from "@/lib/billing/billing";
import { listProjects } from "@/lib/master-data/projects";
import { listClients, type ClientListFilters } from "@/lib/master-data/clients";
import { listSuppliers } from "@/lib/master-data/suppliers";
import { listClarification, resolveListRelations } from "./list-context";
import {
  assistantListHref,
  dateInListRange,
  listFilterLabels,
  unsupportedListFilters,
} from "./list-filters";

interface RecordsPage {
  items: AssistantRecord[];
  total: number;
}

function recordContext(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(" · ");
}

function orderRecord(order: OrderSummary): AssistantRecord {
  return {
    id: order.id,
    type: "Order",
    label: order.orderNumber,
    href: `/orders/${encodeURIComponent(order.id)}`,
    context: recordContext([
      order.project.name,
      order.supplier.displayName,
      order.shortDescription || order.packageName,
      `Delivery: ${formatEnumLabel(order.status)}`,
      `Payment: ${recordPaymentStatusLabel(order.supplierPayment.status, null, order.status === "CANCELLED")}`,
      order.supplierPayment.nextDueDate
        ? `Due: ${formatDateOnly(order.supplierPayment.nextDueDate)}`
        : null,
    ]),
  };
}

function billingRecord(document: ClientBillingView): AssistantRecord {
  return {
    id: document.id,
    type: "Billing",
    label: document.reference,
    href: `/billing/${encodeURIComponent(document.id)}`,
    context: recordContext([
      document.project.name,
      document.client.displayName,
      document.shortDescription,
      formatEnumLabel(document.documentType),
      formatEnumLabel(document.status),
      document.documentDate
        ? `Date: ${formatDateOnly(document.documentDate)}`
        : null,
    ]),
  };
}

/** Native paged readers supply current domain-derived values; never use all=true. */
async function boundedRecords<T extends { id: string }>(
  read: (page: number) => Promise<{ items: T[]; total: number }>,
): Promise<T[] | null> {
  const first = await read(1);
  if (first.total > ASSISTANT_DERIVED_SCOPE_LIMIT) return null;
  const records = [...first.items];
  for (let page = 2; page <= Math.ceil(first.total / 100); page += 1) {
    const next = await read(page);
    if (next.total > ASSISTANT_DERIVED_SCOPE_LIMIT) return null;
    if (next.total !== first.total) throw unstableScopeError();
    records.push(...next.items);
  }
  // Detect insertions, removals and moved rows instead of claiming an exact count
  // from an incomplete set. These reads deliberately do not hold a DB transaction.
  if (
    records.length !== first.total ||
    new Set(records.map((record) => record.id)).size !== first.total
  )
    throw unstableScopeError();
  return records;
}

function unstableScopeError(): IncompleteListError {
  return new IncompleteListError(
    "Records changed while loading this list. Please retry or narrow the filters.",
  );
}

function filteredPage<T extends { id: string }>(
  records: T[],
  page: number,
  matches: (record: T) => boolean,
  present: (record: T) => AssistantRecord,
): RecordsPage {
  const matching = records.filter(matches);
  const skip = (page - 1) * ASSISTANT_LIST_PAGE_SIZE;
  return {
    items: matching.slice(skip, skip + ASSISTANT_LIST_PAGE_SIZE).map(present),
    total: matching.length,
  };
}

function orderMatches(order: OrderSummary, query: AssistantListQuery): boolean {
  if (query.paymentStatus) {
    if (order.status === "CANCELLED") return false;
    if (query.paymentStatus === "UNPAID") {
      if (
        order.supplierPayment.outstanding === null ||
        !new Decimal(order.supplierPayment.outstanding).greaterThan(0)
      )
        return false;
    } else if (order.supplierPayment.status !== query.paymentStatus)
      return false;
  }
  const date =
    query.dateField === "dueDate"
      ? order.supplierPayment.status === "PAID" || order.status === "CANCELLED"
        ? null
        : order.supplierPayment.nextDueDate
      : query.dateField === "documentDate"
        ? order.invoiceDate
        : order.orderDate;
  return dateInListRange(date, query);
}

function billingMatches(
  document: ClientBillingView,
  query: AssistantListQuery,
): boolean {
  if (query.status === "ISSUED") {
    if (document.documentType !== "INVOICE" || !billingIsIssued(document))
      return false;
  } else if (query.status && document.status !== query.status) return false;
  if (query.paymentStatus) {
    if (document.documentType !== "INVOICE" || !billingIsIssued(document))
      return false;
    if (query.paymentStatus === "UNPAID") {
      if (!new Decimal(document.outstanding).greaterThan(0)) return false;
    } else if (document.status !== query.paymentStatus) return false;
  }
  const date =
    query.dateField === "dueDate"
      ? document.isCancelled ||
        !new Decimal(document.outstanding).greaterThan(0)
        ? null
        : document.dueDate
      : document.documentDate;
  return dateInListRange(date, query);
}

async function orderList(
  query: AssistantListQuery,
  page: number,
): Promise<RecordsPage | null> {
  const status = Object.values(ProcurementOrderStatus).find(
    (value) => value === query.status,
  );
  const filters = {
    projectId: query.projectId ?? undefined,
    supplierId: query.supplierId ?? undefined,
    query: query.query,
    status,
    sort: "updated" as const,
    direction: "desc" as const,
    dateFrom:
      query.dateField === "orderDate"
        ? (query.dateFrom ?? undefined)
        : undefined,
    dateTo:
      query.dateField === "orderDate" ? (query.dateTo ?? undefined) : undefined,
  };
  if (
    query.paymentStatus ||
    ((query.dateFrom || query.dateTo) && query.dateField !== "orderDate")
  ) {
    const records = await boundedRecords((next) =>
      listOrdersPage({ ...filters, page: next, pageSize: 100 }),
    );
    if (!records) return null;
    if (
      query.paymentStatus === "UNPAID" &&
      records.some(
        (order) =>
          order.status !== "CANCELLED" &&
          order.supplierPayment.outstanding === null,
      )
    ) {
      throw new IncompleteListError(
        "Some Orders have incomplete payable amounts. Open Purchasing to review them before filtering all unpaid Orders.",
      );
    }
    return filteredPage(
      records,
      page,
      (record) => orderMatches(record, query),
      orderRecord,
    );
  }
  const result = await listOrdersPage({
    ...filters,
    page,
    pageSize: ASSISTANT_LIST_PAGE_SIZE,
  });
  return { ...result, items: result.items.map(orderRecord) };
}

async function billingList(
  query: AssistantListQuery,
  page: number,
): Promise<RecordsPage | null> {
  const filters = {
    projectId: query.projectId ?? undefined,
    clientId: query.clientId ?? undefined,
    documentType: query.documentType ?? undefined,
    query: query.query,
    sort: "updated" as const,
    direction: "desc" as const,
  };
  if (query.status || query.paymentStatus || query.dateFrom || query.dateTo) {
    const records = await boundedRecords((next) =>
      listClientBillingPage({ ...filters, page: next, pageSize: 100 }),
    );
    return records
      ? filteredPage(
          records,
          page,
          (record) => billingMatches(record, query),
          billingRecord,
        )
      : null;
  }
  const result = await listClientBillingPage({
    ...filters,
    page,
    pageSize: ASSISTANT_LIST_PAGE_SIZE,
  });
  return { ...result, items: result.items.map(billingRecord) };
}

async function readList(
  query: AssistantListQuery,
  page: number,
): Promise<RecordsPage | null> {
  if (query.kind === "Order") return orderList(query, page);
  if (query.kind === "Billing") return billingList(query, page);
  if (query.kind === "Project") {
    const result = await listProjects({
      clientId: query.clientId ?? undefined,
      query: query.query,
      status: Object.values(ProjectStatus).find(
        (value) => value === query.status,
      ),
      page,
      pageSize: ASSISTANT_LIST_PAGE_SIZE,
      sort: "name",
      direction: "asc",
    });
    return {
      total: result.total,
      items: result.items.map((project) => ({
        id: project.id,
        type: "Project",
        label: project.name,
        href: `/projects/${encodeURIComponent(project.id)}`,
        context: recordContext([
          project.code,
          project.client?.displayName,
          formatEnumLabel(project.status),
        ]),
      })),
    };
  }
  const filters: ClientListFilters = {
    query: query.query,
    active: query.active ?? "active",
    page,
    pageSize: ASSISTANT_LIST_PAGE_SIZE,
    sort: "name" as const,
    direction: "asc" as const,
  };
  const result =
    query.kind === "Client"
      ? await listClients(filters)
      : await listSuppliers(filters);
  const type = query.kind;
  return {
    total: result.total,
    items: result.items.map((record) => ({
      id: record.id,
      type,
      label: record.displayName,
      href: `/${type === "Client" ? "clients" : "suppliers"}/${encodeURIComponent(record.id)}`,
      context: recordContext([
        record.legalName,
        record.isActive ? "Active" : "Inactive",
      ]),
    })),
  };
}

class IncompleteListError extends Error {}

/** Caller must resolve the active employee; every result remains read-only. */
export async function listAssistantRecords(
  input: AssistantListPage,
): Promise<AssistantReply> {
  const parsed = assistantListPageSchema.parse(input);
  const unsupported = unsupportedListFilters(parsed.query);
  if (unsupported) return listClarification(unsupported);
  const resolved = await resolveListRelations(parsed.query);
  if ("reply" in resolved) return resolved.reply;
  const query = resolved.query;
  const visibleFilters = () =>
    listFilterLabels({ ...query, ...resolved.labels });
  if (
    (query.kind === "Client" || query.kind === "Supplier") &&
    query.active === null
  )
    query.active = "active";
  let result: RecordsPage | null;
  try {
    result = await readList(query, parsed.page);
  } catch (error) {
    if (error instanceof IncompleteListError)
      return listClarification(error.message);
    throw error;
  }
  if (!result) {
    const scope = visibleFilters().join("; ");
    return listClarification(
      `This scope exceeds ${ASSISTANT_DERIVED_SCOPE_LIMIT} records. Narrow by Project, Supplier, Client or reference before applying payment or date filters.${scope ? ` Current filters: ${scope}.` : ""}`,
    );
  }
  const hasNext = parsed.page * ASSISTANT_LIST_PAGE_SIZE < result.total;
  const start = (parsed.page - 1) * ASSISTANT_LIST_PAGE_SIZE + 1;
  return {
    message: result.items.length
      ? `Showing ${start}–${start + result.items.length - 1} of ${result.total} matching records.`
      : result.total
        ? "No records on this page. Go to the previous page."
        : "No matching records found. Try changing a filter.",
    results: result.items,
    query: query.query || null,
    moreHref: assistantListHref(query),
    moreLabel: "Open list",
    truncated: hasNext || parsed.page > 1,
    listing: {
      query,
      page: parsed.page,
      pageSize: ASSISTANT_LIST_PAGE_SIZE,
      total: result.total,
      hasNext,
      hasPrevious: parsed.page > 1,
      filters: visibleFilters(),
    },
  };
}
