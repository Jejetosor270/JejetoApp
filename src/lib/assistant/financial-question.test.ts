import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  financial: vi.fn(),
  search: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/assistant/context", () => ({
  resolveAssistantContext: mocks.context,
}));
vi.mock("@/lib/assistant/financial", () => ({
  readAssistantFinancials: mocks.financial,
}));
vi.mock("@/lib/assistant/search", () => ({
  searchAssistantRecords: mocks.search,
}));

import { answerFinancialQuestion } from "./financial-question";
import {
  assistantSearchPlanSchema,
  type AssistantRequest,
  type AssistantSearchPlan,
} from "@/domain/assistant/contracts";
import {
  emptyAssistantFilters,
  type AssistantPlanFilters,
} from "@/domain/assistant/lists";
import { AssistantQueryError } from "@/domain/assistant/list-plan";

const projectId = "00000000-0000-4000-8000-000000000001";
const otherProjectId = "00000000-0000-4000-8000-000000000002";
const request: AssistantRequest = {
  message: "How are this Project's finances?",
  recentMessages: [],
};
const reply = {
  message: "Current figures.",
  results: [],
  query: null,
  moreHref: null,
  truncated: false,
};
const project = {
  id: projectId,
  type: "Project",
  label: "Example Villa",
  context: "VILLA",
  href: `/projects/${projectId}`,
};

function plan(
  overrides: Partial<AssistantSearchPlan> = {},
): AssistantSearchPlan {
  return assistantSearchPlanSchema.parse({
    intent: "FINANCIAL",
    kind: "Project",
    query: null,
    financialTopic: "cash",
    ...overrides,
  });
}
function filteredPlan(filters: Partial<AssistantPlanFilters>) {
  return plan({ filters: { ...emptyAssistantFilters, ...filters } });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({ projectId });
  mocks.search.mockResolvedValue({ results: [project], truncated: false });
  mocks.financial.mockResolvedValue(reply);
});

describe("JejetoBot financial scope resolution", () => {
  it("resolves exactly one complete named Project match", async () => {
    expect(
      await answerFinancialQuestion(
        filteredPlan({ project: "Example" }),
        request,
      ),
    ).toBe(reply);
    expect(mocks.search).toHaveBeenCalledExactlyOnceWith("Example", "Project");
    expect(mocks.financial).toHaveBeenCalledExactlyOnceWith({
      projectId,
      topic: "cash",
    });
    expect(mocks.context).not.toHaveBeenCalled();
  });

  it.each([
    {
      results: [
        project,
        { ...project, id: otherProjectId, label: "Other Villa" },
      ],
      truncated: false,
    },
    { results: [project], truncated: true },
    { results: [project], truncated: false, requiresConfirmation: true },
  ])(
    "asks for selection on ambiguous or truncated name matches",
    async (found) => {
      mocks.search.mockResolvedValue(found);
      const response = await answerFinancialQuestion(
        filteredPlan({ project: "Villa" }),
        request,
      );
      expect(response.financialClarification).toEqual({
        topic: "cash",
        choices: found.results.map(({ id, label, context }) => ({
          id,
          label,
          context,
        })),
      });
      expect(response.truncated).toBe(found.truncated);
      expect(response.answer).toBeUndefined();
      expect(response.pendingFinancialTopic).toBe("cash");
      expect(mocks.financial).not.toHaveBeenCalled();
    },
  );

  it("does not turn an unmatched name into all Projects or a prior Project", async () => {
    mocks.search.mockResolvedValue({ results: [], truncated: false });
    const response = await answerFinancialQuestion(
      filteredPlan({ project: "Missing" }),
      {
        ...request,
        previousFinancial: { projectId, topic: "overview" },
      },
    );
    expect(response.message).toContain("No matching Project");
    expect(response.financialClarification).toBeUndefined();
    expect(response.pendingFinancialTopic).toBe("cash");
    expect(mocks.financial).not.toHaveBeenCalled();
  });

  it("uses verified current context rather than a page ID as the Project ID", async () => {
    const context = { kind: "Order" as const, id: otherProjectId };
    expect(
      await answerFinancialQuestion(plan({ contextScope: "PROJECT" }), {
        ...request,
        context,
      }),
    ).toBe(reply);
    expect(mocks.context).toHaveBeenCalledExactlyOnceWith(context, "PROJECT");
    expect(mocks.financial).toHaveBeenCalledExactlyOnceWith({
      projectId,
      topic: "cash",
    });
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("changes topic while retaining only an explicit prior financial Project", async () => {
    await answerFinancialQuestion(
      plan({ followUp: true, financialTopic: "vat" }),
      {
        ...request,
        previousFinancial: { projectId, topic: "cash" },
        context: { kind: "Project", id: otherProjectId },
      },
    );
    expect(mocks.financial).toHaveBeenCalledExactlyOnceWith({
      projectId,
      topic: "vat",
    });
    expect(mocks.context).not.toHaveBeenCalled();
  });

  it("continues the original question after a corrected Project name", async () => {
    await answerFinancialQuestion(filteredPlan({ project: "Villas Bled" }), {
      message: "villas bled",
      recentMessages: ["What's my cash on villa bled?"],
      pendingFinancialTopic: "cash",
    });
    expect(mocks.search).toHaveBeenCalledExactlyOnceWith(
      "Villas Bled",
      "Project",
    );
    expect(mocks.financial).toHaveBeenCalledExactlyOnceWith({
      projectId,
      topic: "cash",
    });
  });

  it("never reuses a stale Project while a corrected name is pending", async () => {
    await expect(
      answerFinancialQuestion(plan({ followUp: true }), {
        ...request,
        pendingFinancialTopic: "costs_profit",
        previousFinancial: { projectId, topic: "cash" },
      }),
    ).rejects.toBeInstanceOf(AssistantQueryError);
    expect(mocks.financial).not.toHaveBeenCalled();
  });

  it("does not infer a financial Project from a previous list", async () => {
    await expect(
      answerFinancialQuestion(plan({ followUp: true }), {
        ...request,
        previousList: {
          page: 1,
          query: {
            ...emptyAssistantFilters,
            kind: "Order",
            query: "",
            projectId,
            supplierId: null,
            clientId: null,
          },
        },
      }),
    ).rejects.toBeInstanceOf(AssistantQueryError);
    expect(mocks.financial).not.toHaveBeenCalled();
  });

  it("does not reuse a previous financial Project without an explicit follow-up", async () => {
    await expect(
      answerFinancialQuestion(plan(), {
        ...request,
        previousFinancial: { projectId, topic: "overview" },
      }),
    ).rejects.toBeInstanceOf(AssistantQueryError);
    expect(mocks.financial).not.toHaveBeenCalled();
  });

  it("lets an explicit new name override the previous financial Project", async () => {
    mocks.search.mockResolvedValue({
      results: [{ ...project, id: otherProjectId }],
      truncated: false,
    });
    await answerFinancialQuestion(
      plan({
        followUp: true,
        filters: { ...emptyAssistantFilters, project: "Other" },
      }),
      {
        ...request,
        previousFinancial: { projectId, topic: "overview" },
      },
    );
    expect(mocks.financial).toHaveBeenCalledExactlyOnceWith({
      projectId: otherProjectId,
      topic: "cash",
    });
  });

  it("rejects simultaneous named and current Project scope", async () => {
    await expect(
      answerFinancialQuestion(
        plan({
          contextScope: "PROJECT",
          filters: { ...emptyAssistantFilters, project: "Example" },
        }),
        request,
      ),
    ).rejects.toBeInstanceOf(AssistantQueryError);
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.financial).not.toHaveBeenCalled();
  });

  it.each([
    { query: "PO-104" },
    { kind: "All" },
    { kind: "Order" },
    { kind: "Billing" },
    { page: "NEXT" },
    { page: "PREVIOUS" },
    { clearFilters: ["status"] },
    { contextScope: "SUPPLIER" },
    { contextScope: "CLIENT" },
  ] satisfies Partial<AssistantSearchPlan>[])(
    "rejects unsupported scope rather than a full Project substitute",
    async (override) => {
      await expect(
        answerFinancialQuestion(plan(override), {
          ...request,
          previousFinancial: { projectId, topic: "cash" },
        }),
      ).rejects.toBeInstanceOf(AssistantQueryError);
      expect(mocks.search).not.toHaveBeenCalled();
      expect(mocks.context).not.toHaveBeenCalled();
      expect(mocks.financial).not.toHaveBeenCalled();
    },
  );

  it.each([
    { supplier: "Supplier" },
    { client: "Client" },
    { status: "ACTIVE" },
    { paymentStatus: "PAID" },
    { documentType: "INVOICE" },
    { dateFrom: "2026-01-01" },
    { dateTo: "2026-10-01" },
    { dateField: "dueDate" },
    { active: "active" },
  ] satisfies Partial<AssistantPlanFilters>[])(
    "rejects unsupported filters rather than silently widening totals",
    async (filters) => {
      await expect(
        answerFinancialQuestion(
          filteredPlan({ project: "Example", ...filters }),
          request,
        ),
      ).rejects.toBeInstanceOf(AssistantQueryError);
      expect(mocks.search).not.toHaveBeenCalled();
      expect(mocks.financial).not.toHaveBeenCalled();
    },
  );

  it.each(["missing", "rejected"])(
    "does not reuse the prior Project when explicit current context is %s",
    async (condition) => {
      if (condition === "missing") mocks.context.mockResolvedValue({});
      else
        mocks.context.mockRejectedValue(
          new AssistantQueryError("Project unavailable"),
        );
      await expect(
        answerFinancialQuestion(
          plan({ followUp: true, contextScope: "PROJECT" }),
          {
            ...request,
            context: { kind: "Billing", id: otherProjectId },
            previousFinancial: { projectId, topic: "cash" },
          },
        ),
      ).rejects.toBeInstanceOf(AssistantQueryError);
      expect(mocks.financial).not.toHaveBeenCalled();
    },
  );
});
