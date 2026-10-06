import "server-only";

import type {
  AssistantReply,
  AssistantRequest,
  AssistantSearchPlan,
} from "@/domain/assistant/contracts";
import { AssistantQueryError } from "@/domain/assistant/list-plan";
import { resolveAssistantContext } from "@/lib/assistant/context";
import { readAssistantFinancials } from "@/lib/assistant/financial";
import { searchAssistantRecords } from "@/lib/assistant/search";

/** Resolve one visible Project; never reinterpret a filtered question as a full total. */
export async function answerFinancialQuestion(
  plan: AssistantSearchPlan,
  request: AssistantRequest,
): Promise<AssistantReply> {
  const topic = plan.financialTopic;
  if (
    !topic ||
    plan.kind !== "Project" ||
    plan.query !== null ||
    plan.page !== "FIRST" ||
    plan.clearFilters.length > 0 ||
    (plan.contextScope !== "NONE" && plan.contextScope !== "PROJECT") ||
    Object.entries(plan.filters).some(
      ([key, value]) => key !== "project" && value !== null,
    )
  ) {
    throw new AssistantQueryError(
      "I can explain a whole Project's current figures. Choose a Project without date, Supplier or status filters.",
    );
  }
  const name = plan.filters.project;
  if (name && plan.contextScope === "PROJECT")
    throw new AssistantQueryError(
      "Choose either the current Project or a named Project.",
    );
  if (name) {
    const found = await searchAssistantRecords(name, "Project");
    if (
      found.results.length === 1 &&
      !found.truncated &&
      !found.requiresConfirmation
    ) {
      const project = found.results[0];
      if (project)
        return readAssistantFinancials({ projectId: project.id, topic });
    }
    return {
      message: found.results.length
        ? found.requiresConfirmation
          ? "I found close Project names. Choose the one you mean and I'll answer your question."
          : "Which Project? Choose a match, or give a more specific name."
        : found.truncated
          ? "The Project search is incomplete. Try a more specific name or code; I'll keep your financial question."
          : "No matching Project yet. Try another spelling or its code; I'll keep your financial question.",
      pendingFinancialTopic: topic,
      results: [],
      query: null,
      moreHref: null,
      truncated: found.truncated,
      ...(found.results.length
        ? {
            financialClarification: {
              topic,
              choices: found.results.map(({ id, label, context }) => ({
                id,
                label,
                context,
              })),
            },
          }
        : {}),
    };
  }
  if (plan.contextScope === "PROJECT") {
    const scope = await resolveAssistantContext(
      request.context ?? null,
      "PROJECT",
    );
    if (scope.projectId)
      return readAssistantFinancials({ projectId: scope.projectId, topic });
    throw new AssistantQueryError(
      "This record has no available Project. Give the Project name instead.",
    );
  }
  if (
    plan.followUp &&
    request.previousFinancial &&
    !request.pendingFinancialTopic
  )
    return readAssistantFinancials({
      projectId: request.previousFinancial.projectId,
      topic,
    });
  throw new AssistantQueryError(
    "Which Project should I explain? Give its name, or open it and ask about this Project.",
  );
}
