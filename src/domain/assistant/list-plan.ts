import type { AssistantSearchPlan } from "@/domain/assistant/contracts";
import {
  assistantListPageSchema,
  emptyAssistantFilters,
  type AssistantListPage,
  type AssistantListQuery,
} from "@/domain/assistant/lists";

export class AssistantQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantQueryError";
  }
}

export type AssistantContextScope = Partial<
  Pick<AssistantListQuery, "projectId" | "supplierId" | "clientId">
>;

/** Carry only explicit, validated filters between lists; never carry result rows. */
export function buildAssistantListPage(
  plan: AssistantSearchPlan,
  previous: AssistantListPage | null,
  context: AssistantContextScope = {},
): AssistantListPage {
  // Page navigation always belongs to the previous list, even if the model omits
  // the follow-up flag. Never replace that scope with an unrestricted first page.
  const continuing = plan.followUp || plan.page !== "FIRST";
  if (continuing && !previous) {
    throw new AssistantQueryError(
      "Which list should I refine? Ask for a list first.",
    );
  }
  const kind =
    plan.kind === "All" && continuing ? previous?.query.kind : plan.kind;
  if (!kind || kind === "All") {
    throw new AssistantQueryError(
      "Which records: Projects, Orders, Billing, Clients or Suppliers?",
    );
  }
  let query: AssistantListQuery = {
    ...emptyAssistantFilters,
    kind,
    query: "",
    projectId: null,
    supplierId: null,
    clientId: null,
  };
  if (continuing && previous) query = { ...previous.query, kind };

  for (const field of plan.clearFilters) {
    if (field === "query") query.query = "";
    else if (field === "dates") {
      query.dateFrom = null;
      query.dateTo = null;
      query.dateField = null;
    } else {
      query[field] = null;
      if (field === "project") query.projectId = null;
      if (field === "supplier") query.supplierId = null;
      if (field === "client") query.clientId = null;
    }
  }
  if (plan.query !== null) query.query = plan.query;
  for (const [field, value] of Object.entries(plan.filters)) {
    if (value !== null) query = { ...query, [field]: value };
  }
  // A new named parent replaces a previous resolution; never keep its old ID.
  if (plan.filters.project !== null) query.projectId = null;
  if (plan.filters.supplier !== null) query.supplierId = null;
  if (plan.filters.client !== null) query.clientId = null;
  for (const field of ["projectId", "supplierId", "clientId"] as const) {
    if (context[field]) {
      const nameField =
        field === "projectId"
          ? "project"
          : field === "supplierId"
            ? "supplier"
            : "client";
      if (plan.filters[nameField] !== null) {
        throw new AssistantQueryError(
          "Choose either the current record or a named record for this filter.",
        );
      }
      query[field] = context[field];
      query[nameField] = null;
    }
  }
  const page =
    plan.page === "NEXT"
      ? (previous?.page ?? 0) + 1
      : plan.page === "PREVIOUS"
        ? Math.max(1, (previous?.page ?? 1) - 1)
        : 1;
  // A filter change always starts a fresh page, even if the model also asks for Next.
  const unchanged =
    previous && JSON.stringify(query) === JSON.stringify(previous.query);
  const parsed = assistantListPageSchema.safeParse({
    query,
    page: unchanged ? page : 1,
  });
  if (!parsed.success)
    throw new AssistantQueryError(
      "Check the date range and filters, then try again.",
    );
  return parsed.data;
}
