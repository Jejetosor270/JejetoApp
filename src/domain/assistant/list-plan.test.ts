import { describe, expect, it } from "vitest";
import { assistantSearchPlanSchema } from "@/domain/assistant/contracts";
import {
  AssistantQueryError,
  buildAssistantListPage,
} from "@/domain/assistant/list-plan";
import {
  assistantContextFromPath,
  assistantListPageSchema,
  emptyAssistantFilters,
  type AssistantListPage,
} from "@/domain/assistant/lists";

const projectId = "11111111-1111-4111-8111-111111111111";
const supplierId = "22222222-2222-4222-8222-222222222222";
const previous: AssistantListPage = {
  query: {
    ...emptyAssistantFilters,
    kind: "Order",
    query: "outdoor",
    supplier: "Acme",
    supplierId,
    project: null,
    projectId,
    clientId: null,
  },
  page: 2,
};
const plan = (input: Record<string, unknown> = {}) =>
  assistantSearchPlanSchema.parse({
    intent: "LIST",
    kind: "Order",
    query: null,
    ...input,
  });

describe("JejetoBot list planning", () => {
  it("starts fresh lists without leaking a previous scope", () => {
    const result = buildAssistantListPage(plan(), previous);
    expect(result.page).toBe(1);
    expect(result.query.projectId).toBeNull();
    expect(result.query.supplierId).toBeNull();
    expect(result.query.query).toBe("");
  });
  it("preserves the resolved scope on explicit follow-ups and resets paging after filtering", () => {
    const result = buildAssistantListPage(
      plan({
        kind: "All",
        followUp: true,
        filters: { ...emptyAssistantFilters, paymentStatus: "OVERDUE" },
        page: "NEXT",
      }),
      previous,
    );
    expect(result.query).toMatchObject({
      kind: "Order",
      projectId,
      supplierId,
      query: "outdoor",
      paymentStatus: "OVERDUE",
    });
    expect(result.page).toBe(1);
  });
  it("changes a named parent without keeping its old resolved ID", () => {
    expect(
      buildAssistantListPage(
        plan({
          followUp: true,
          filters: { ...emptyAssistantFilters, supplier: "New Supplier" },
        }),
        previous,
      ).query,
    ).toMatchObject({ supplier: "New Supplier", supplierId: null, projectId });
  });
  it("clears only requested criteria, including resolved parents and complete date ranges", () => {
    const result = buildAssistantListPage(
      plan({
        followUp: true,
        clearFilters: ["supplier", "query", "dates", "status"],
      }),
      {
        ...previous,
        query: {
          ...previous.query,
          status: "ORDERED",
          dateFrom: "2026-01-01",
          dateTo: "2026-10-01",
          dateField: "orderDate",
        },
      },
    );
    expect(result.query).toMatchObject({
      supplier: null,
      supplierId: null,
      query: "",
      dateFrom: null,
      dateTo: null,
      dateField: null,
      status: null,
      projectId,
    });
  });
  it("applies verified page context without carrying an older name", () => {
    expect(
      buildAssistantListPage(
        plan({ followUp: true, contextScope: "SUPPLIER" }),
        previous,
        { supplierId },
      ).query,
    ).toMatchObject({ supplierId, supplier: null });
    expect(() =>
      buildAssistantListPage(
        plan({ filters: { ...emptyAssistantFilters, project: "Elsewhere" } }),
        null,
        { projectId },
      ),
    ).toThrow(AssistantQueryError);
  });
  it("asks which list when a follow-up, next page, or type is missing", () => {
    expect(() =>
      buildAssistantListPage(plan({ followUp: true }), null),
    ).toThrow("Which list");
    expect(() => buildAssistantListPage(plan({ page: "NEXT" }), null)).toThrow(
      "Which list",
    );
    expect(() => buildAssistantListPage(plan({ kind: "All" }), null)).toThrow(
      "Which records",
    );
  });
  it("pages unchanged criteria without silently broadening them", () => {
    expect(
      buildAssistantListPage(plan({ followUp: true, page: "NEXT" }), previous),
    ).toEqual({ ...previous, page: 3 });
    expect(
      buildAssistantListPage(
        plan({ followUp: true, page: "PREVIOUS" }),
        previous,
      ).page,
    ).toBe(1);
    expect(
      buildAssistantListPage(plan({ followUp: true, page: "PREVIOUS" }), {
        ...previous,
        page: 1,
      }).page,
    ).toBe(1);
  });
  it.each([
    ["NEXT", 3],
    ["PREVIOUS", 1],
  ])("retains scope for %s even without a follow-up flag", (page, expected) => {
    expect(
      buildAssistantListPage(
        plan({ kind: "All", followUp: false, page }),
        previous,
      ),
    ).toEqual({ ...previous, page: expected });
  });
  it("rejects invalid ranges, injected properties, IDs and unbounded page numbers", () => {
    expect(() =>
      buildAssistantListPage(
        plan({
          filters: {
            ...emptyAssistantFilters,
            dateFrom: "2026-10-10",
            dateTo: "2026-10-01",
          },
        }),
        null,
      ),
    ).toThrow("date range");
    for (const input of [
      { ...previous, page: 10_001 },
      { ...previous, page: 0 },
      { ...previous, sql: "untrusted" },
      { ...previous, query: { ...previous.query, projectId: "not-a-uuid" } },
      { ...previous, query: { ...previous.query, access: "admin" } },
    ])
      expect(assistantListPageSchema.safeParse(input).success).toBe(false);
  });
});

describe("page context recognition", () => {
  it.each([
    ["projects", "Project"],
    ["orders", "Order"],
    ["billing", "Billing"],
    ["clients", "Client"],
    ["suppliers", "Supplier"],
  ])("recognizes a %s record without trusting URL filters", (segment, kind) => {
    expect(assistantContextFromPath(`/${segment}/${projectId}`)).toEqual({
      kind,
      id: projectId,
    });
  });
  it.each([
    "/",
    "/orders",
    "/orders/new",
    "/settings",
    `/projects/${projectId}/unexpected`,
    `/projects/${projectId}?admin=true`,
    "https://example.com/projects/x",
  ])("ignores %s", (path) => {
    expect(assistantContextFromPath(path)).toBeNull();
  });
});
