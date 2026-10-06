import type {
  AssistantReply,
  AssistantSearchPlan,
  AssistantSearchResults,
} from "@/domain/assistant/contracts";

export function assistantScopeReply(
  intent: "CLARIFY" | "OUT_OF_SCOPE",
): AssistantReply {
  return {
    message:
      intent === "CLARIFY"
        ? "Which records? Give me a name or reference, or ask for a list of Projects, Orders, Billing, Clients or Suppliers."
        : "JejetoBot can find and list ERP records. I cannot change records, calculate financial totals or answer unrelated questions.",
    query: null,
    moreHref: null,
    results: [],
    truncated: false,
  };
}

export function assistantSearchReply(
  plan: Pick<AssistantSearchPlan, "query">,
  found: AssistantSearchResults,
): AssistantReply {
  let message = "No matching records found. Try another name or reference.";
  if (found.results.length === 1) {
    message = "Here is a matching record. Open it to check the details.";
  } else if (found.results.length > 1) {
    message =
      "Which record did you mean? Choose a match or give a more specific name or reference.";
  }
  if (found.truncated) {
    message =
      "Here are the first matches, not a complete list. Refine the name or reference, or open Search.";
  }

  return {
    ...found,
    message,
    query: plan.query,
    moreHref:
      found.truncated && plan.query
        ? `/search?q=${encodeURIComponent(plan.query)}`
        : null,
  };
}
