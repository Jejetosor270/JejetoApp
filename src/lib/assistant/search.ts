import "server-only";

import {
  ASSISTANT_RESULT_LIMIT,
  assistantSearchPlanSchema,
  type AssistantRecord,
  type AssistantRecordKind,
  type AssistantSearchPlan,
  type AssistantSearchResults,
} from "@/domain/assistant/contracts";
import { getDatabase } from "@/lib/db";
import { searchAssistantProjects } from "./project-search";

type SearchKind = AssistantSearchPlan["kind"];

/** Uses only the shared, Trash-aware client. The caller must resolve the active user. */
async function findRecords(
  query: string,
  kind: SearchKind,
  exact: boolean,
  excludedRecords: AssistantRecord[],
): Promise<AssistantRecord[]> {
  const database = getDatabase();
  const match = exact
    ? { equals: query, mode: "insensitive" as const }
    : { contains: query, mode: "insensitive" as const };
  const idFor = (type: AssistantRecordKind) => ({
    notIn: excludedRecords
      .filter((record) => record.type === type)
      .map((record) => record.id),
  });
  const take = ASSISTANT_RESULT_LIMIT + 1;
  const [orders, billing, clients, suppliers] = await Promise.all([
    kind === "All" || kind === "Order"
      ? database.procurementOrder.findMany({
          where: {
            id: idFor("Order"),
            OR: [
              { orderNumber: match },
              { packageName: match },
              { shortDescription: match },
              { supplierQuoteReference: match },
            ],
          },
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          take,
          select: {
            id: true,
            orderNumber: true,
            packageName: true,
            shortDescription: true,
            project: { select: { name: true } },
            supplier: { select: { displayName: true } },
          },
        })
      : Promise.resolve([]),
    kind === "All" || kind === "Billing"
      ? database.clientBillingDocument.findMany({
          where: {
            id: idFor("Billing"),
            OR: [{ reference: match }, { shortDescription: match }],
          },
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          take,
          select: {
            id: true,
            reference: true,
            shortDescription: true,
            project: { select: { name: true } },
            client: { select: { displayName: true } },
          },
        })
      : Promise.resolve([]),
    kind === "All" || kind === "Client"
      ? database.client.findMany({
          where: {
            id: idFor("Client"),
            OR: [{ displayName: match }, { legalName: match }],
          },
          orderBy: [{ displayName: "asc" }, { id: "asc" }],
          take,
          select: { id: true, displayName: true, legalName: true },
        })
      : Promise.resolve([]),
    kind === "All" || kind === "Supplier"
      ? database.supplier.findMany({
          where: {
            id: idFor("Supplier"),
            OR: [{ displayName: match }, { legalName: match }],
          },
          orderBy: [{ displayName: "asc" }, { id: "asc" }],
          take,
          select: { id: true, displayName: true, legalName: true },
        })
      : Promise.resolve([]),
  ]);

  return [
    ...orders.map((order): AssistantRecord => ({
      id: order.id,
      type: "Order",
      label: order.orderNumber,
      context: [
        order.project?.name ?? "Unassigned",
        order.supplier?.displayName ?? "Unassigned",
        order.shortDescription || order.packageName,
      ].join(" · "),
      href: `/orders/${encodeURIComponent(order.id)}`,
    })),
    ...billing.map((document): AssistantRecord => ({
      id: document.id,
      type: "Billing",
      label: document.reference,
      context: [
        document.client?.displayName ?? "Unassigned",
        document.project?.name ?? "Unassigned",
        document.shortDescription,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/billing/${encodeURIComponent(document.id)}`,
    })),
    ...clients.map((client): AssistantRecord => ({
      id: client.id,
      type: "Client",
      label: client.displayName,
      context: client.legalName,
      href: `/clients/${encodeURIComponent(client.id)}`,
    })),
    ...suppliers.map((supplier): AssistantRecord => ({
      id: supplier.id,
      type: "Supplier",
      label: supplier.displayName,
      context: supplier.legalName,
      href: `/suppliers/${encodeURIComponent(supplier.id)}`,
    })),
  ];
}

export async function searchAssistantRecords(
  query: string,
  kind: SearchKind,
): Promise<AssistantSearchResults> {
  // Reject invalid runtime input before initializing a database connection.
  const plan = assistantSearchPlanSchema.parse({
    intent: "SEARCH",
    query,
    kind,
  });
  if (plan.query === null) {
    throw new Error("A record search needs a name or reference.");
  }
  if (plan.kind === "Project") return searchAssistantProjects(plan.query);
  const exact = await findRecords(plan.query, plan.kind, true, []);
  const partial =
    exact.length > ASSISTANT_RESULT_LIMIT
      ? []
      : await findRecords(plan.query, plan.kind, false, exact);
  const otherMatches = [...exact, ...partial];
  const projects =
    plan.kind === "All"
      ? await searchAssistantProjects(plan.query, {
          allowSuggestions: otherMatches.length === 0,
        })
      : ({ results: [], truncated: false } satisfies AssistantSearchResults);
  const matches = projects.requiresConfirmation
    ? [...exact, ...projects.results, ...partial]
    : [...projects.results, ...otherMatches];
  return {
    results: matches.slice(0, ASSISTANT_RESULT_LIMIT),
    truncated: projects.truncated || matches.length > ASSISTANT_RESULT_LIMIT,
    ...(projects.requiresConfirmation ? { requiresConfirmation: true } : {}),
  };
}
