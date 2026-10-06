"use server";

import { unstable_rethrow } from "next/navigation";

import {
  assistantRequestSchema,
  assistantSearchPlanSchema,
  type AssistantActionResult,
} from "@/domain/assistant/contracts";
import {
  assistantScopeReply,
  assistantSearchReply,
} from "@/domain/assistant/replies";
import { requireUser } from "@/lib/auth/current-user";
import { planAssistantSearch } from "@/lib/assistant/planner";
import {
  AssistantLimitError,
  withAssistantRequest,
} from "@/lib/assistant/request-guard";
import { searchAssistantRecords } from "@/lib/assistant/search";
import { assistantListPageSchema } from "@/domain/assistant/lists";
import {
  AssistantQueryError,
  buildAssistantListPage,
} from "@/domain/assistant/list-plan";
import { listAssistantRecords } from "@/lib/assistant/lists";
import { resolveAssistantContext } from "@/lib/assistant/context";
import { getAssistantHelp } from "@/domain/assistant/help";
import { assistantFinancialRequestSchema } from "@/domain/assistant/answers";
import { readAssistantFinancials } from "@/lib/assistant/financial";
import { answerFinancialQuestion } from "@/lib/assistant/financial-question";

function failure(error: unknown): AssistantActionResult {
  unstable_rethrow(error);
  if (error instanceof AssistantLimitError) {
    return { ok: false, code: "LIMIT", error: error.message };
  }
  if (error instanceof AssistantQueryError) {
    return {
      ok: true,
      reply: { ...assistantScopeReply("CLARIFY"), message: error.message },
    };
  }
  // Never log questions, database rows, provider outputs or exception text.
  console.error("[JejetoBot] Request failed", { category: "request_failed" });
  return {
    ok: false,
    code: "UNAVAILABLE",
    error: "JejetoBot is unavailable right now. Try again, or use Search.",
  };
}

export async function askAssistant(
  input: unknown,
): Promise<AssistantActionResult> {
  const user = await requireUser();
  const request = assistantRequestSchema.safeParse(input);
  if (!request.success) {
    return {
      ok: false,
      code: "INVALID",
      error: "Enter a short question (2–800 characters) and try again.",
    };
  }

  try {
    return await withAssistantRequest(user.id, async () => {
      const plan = assistantSearchPlanSchema.parse(
        await planAssistantSearch(request.data),
      );
      // Resolve the active employee again after the external request. Never trust
      // role claims, user IDs, record contents or query instructions from the model.
      const currentUser = await requireUser();
      if (currentUser.id !== user.id) {
        return {
          ok: false,
          code: "UNAVAILABLE",
          error: "Your session changed. Reload the page and try again.",
        };
      }
      if (plan.intent === "CLARIFY" || plan.intent === "OUT_OF_SCOPE") {
        return { ok: true, reply: assistantScopeReply(plan.intent) };
      }
      if (plan.intent === "HELP" && plan.helpTopic) {
        if (
          plan.kind !== "All" ||
          plan.query ||
          plan.contextScope !== "NONE" ||
          plan.followUp ||
          plan.page !== "FIRST" ||
          plan.clearFilters.length ||
          Object.values(plan.filters).some((value) => value !== null)
        )
          throw new AssistantQueryError(
            "Ask a workflow question without record filters, or ask about a specific Project's figures.",
          );
        return {
          ok: true,
          reply: {
            message: "Application guide",
            results: [],
            query: null,
            moreHref: null,
            truncated: false,
            answer: getAssistantHelp(plan.helpTopic, currentUser.role),
          },
        };
      }
      if (plan.intent === "FINANCIAL")
        return {
          ok: true,
          reply: await answerFinancialQuestion(plan, request.data),
        };
      const hasScope =
        plan.contextScope !== "NONE" ||
        plan.followUp ||
        plan.page !== "FIRST" ||
        plan.clearFilters.length > 0 ||
        Object.values(plan.filters).some((value) => value !== null);
      if (plan.intent === "LIST" || hasScope) {
        const context = await resolveAssistantContext(
          request.data.context,
          plan.contextScope,
        );
        const page = buildAssistantListPage(
          plan,
          request.data.previousList,
          context,
        );
        return { ok: true, reply: await listAssistantRecords(page) };
      }
      // The schema guarantees a non-null search query; keep the guard explicit.
      if (plan.query === null) throw new Error("Invalid assistant search plan");
      const found = await searchAssistantRecords(plan.query, plan.kind);
      return { ok: true, reply: assistantSearchReply(plan, found) };
    });
  } catch (error) {
    return failure(error);
  }
}

/** Explicit Project selection refreshes canonical figures without another AI request. */
export async function readAssistantFinancial(
  input: unknown,
): Promise<AssistantActionResult> {
  const user = await requireUser();
  const request = assistantFinancialRequestSchema.safeParse(input);
  if (!request.success)
    return {
      ok: false,
      code: "INVALID",
      error: "Choose a valid Project and financial topic.",
    };
  try {
    return await withAssistantRequest(user.id, async () => ({
      ok: true,
      reply: await readAssistantFinancials(request.data),
    }));
  } catch (error) {
    return failure(error);
  }
}

/** Paging and choosing a parent record reuse validated criteria without another AI call. */
export async function readAssistantList(
  input: unknown,
): Promise<AssistantActionResult> {
  const user = await requireUser();
  const parsed = assistantListPageSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      code: "INVALID",
      error: "The list filters are invalid. Ask JejetoBot for a new list.",
    };
  try {
    return await withAssistantRequest(user.id, async () => ({
      ok: true,
      reply: await listAssistantRecords(parsed.data),
    }));
  } catch (error) {
    return failure(error);
  }
}
