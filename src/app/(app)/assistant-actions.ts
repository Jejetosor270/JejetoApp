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
      if (plan.intent !== "SEARCH") {
        return { ok: true, reply: assistantScopeReply(plan.intent) };
      }
      // The schema guarantees a non-null search query; keep the guard explicit.
      if (plan.query === null) throw new Error("Invalid assistant search plan");
      const found = await searchAssistantRecords(plan.query, plan.kind);
      return { ok: true, reply: assistantSearchReply(plan, found) };
    });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AssistantLimitError) {
      return { ok: false, code: "LIMIT", error: error.message };
    }
    // Do not log the prompt, database records, raw provider output or exception text.
    console.error("[assistant] Request failed", { category: "request_failed" });
    return {
      ok: false,
      code: "UNAVAILABLE",
      error:
        "The assistant is unavailable right now. Try again, or use Search.",
    };
  }
}
