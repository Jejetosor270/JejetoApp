import "server-only";

import type { AssistantReply } from "@/domain/assistant/contracts";
import type {
  AssistantListQuery,
  AssistantRelationField,
} from "@/domain/assistant/lists";
import { getDatabase } from "@/lib/db";
import { searchAssistantRecords } from "@/lib/assistant/search";

export function listClarification(message: string): AssistantReply {
  return {
    message,
    query: null,
    moreHref: null,
    results: [],
    truncated: false,
  };
}

const relations = [
  { name: "project", field: "projectId", kind: "Project" },
  { name: "supplier", field: "supplierId", kind: "Supplier" },
  { name: "client", field: "clientId", kind: "Client" },
] as const;

/** Names and supplied IDs never broaden a missing or ambiguous relationship. */
export async function resolveListRelations(input: AssistantListQuery): Promise<
  | {
      query: AssistantListQuery;
      labels: Partial<
        Pick<AssistantListQuery, "project" | "supplier" | "client">
      >;
    }
  | { reply: AssistantReply }
> {
  const query = { ...input };
  const labels: Partial<
    Pick<AssistantListQuery, "project" | "supplier" | "client">
  > = {};
  for (const { name, field, kind } of relations) {
    if (!query[field] && query[name]) {
      const found = await searchAssistantRecords(query[name], kind);
      if (!found.results.length) {
        return {
          reply: listClarification(
            found.truncated
              ? `The ${kind} search is incomplete. Try a more specific name or code.`
              : `No matching ${kind} found. Check the name and try again.`,
          ),
        };
      }
      if (
        found.results.length !== 1 ||
        found.truncated ||
        found.requiresConfirmation
      ) {
        return {
          reply: {
            ...listClarification(
              found.requiresConfirmation
                ? `I found close ${kind} names. Choose the one you mean.`
                : `Which ${kind}? Choose a match, or give a more specific name.`,
            ),
            clarification: {
              query,
              choices: found.results.map((record) => ({
                field,
                id: record.id,
                label: record.label,
                context: record.context,
              })),
            },
          },
        };
      }
      query[field] = found.results[0]?.id ?? null;
    }
    const id = query[field];
    if (!id) continue;
    const label = await relationLabel(field, id);
    if (label === null) {
      return {
        reply: listClarification(
          `That ${kind} is no longer available. Choose another record.`,
        ),
      };
    }
    labels[name] = label;
  }
  return { query, labels };
}

async function relationLabel(
  field: AssistantRelationField,
  id: string,
): Promise<string | null> {
  const database = getDatabase();
  if (field === "projectId") {
    const record = await database.project.findUnique({
      where: { id },
      select: { name: true },
    });
    return record?.name ?? null;
  }
  const record =
    field === "supplierId"
      ? await database.supplier.findUnique({
          where: { id },
          select: { displayName: true },
        })
      : await database.client.findUnique({
          where: { id },
          select: { displayName: true },
        });
  return record?.displayName ?? null;
}
