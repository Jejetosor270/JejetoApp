import "server-only";

import {
  AssistantQueryError,
  type AssistantContextScope,
} from "@/domain/assistant/list-plan";
import type { AssistantPageContext } from "@/domain/assistant/lists";
import type { AssistantSearchPlan } from "@/domain/assistant/contracts";
import { getDatabase } from "@/lib/db";

/** A browser path is only a hint. Resolve its visible record and relationships again. */
export async function resolveAssistantContext(
  context: AssistantPageContext | null,
  scope: AssistantSearchPlan["contextScope"],
): Promise<AssistantContextScope> {
  if (scope === "NONE") return {};
  if (!context)
    throw new AssistantQueryError(
      "Open the relevant record, or give its Project, Supplier or Client name.",
    );
  const db = getDatabase();
  let projectId: string | null = null;
  let supplierId: string | null = null;
  let clientId: string | null = null;
  switch (context.kind) {
    case "Project": {
      const project = await db.project.findUnique({
        where: { id: context.id },
        select: { id: true, clientId: true },
      });
      projectId = project?.id ?? null;
      clientId = project?.clientId ?? null;
      break;
    }
    case "Order": {
      const order = await db.procurementOrder.findUnique({
        where: { id: context.id },
        select: {
          projectId: true,
          supplierId: true,
          project: { select: { clientId: true } },
        },
      });
      projectId = order?.projectId ?? null;
      supplierId = order?.supplierId ?? null;
      clientId = order?.project?.clientId ?? null;
      break;
    }
    case "Billing": {
      const billing = await db.clientBillingDocument.findUnique({
        where: { id: context.id },
        select: { projectId: true, clientId: true },
      });
      projectId = billing?.projectId ?? null;
      clientId = billing?.clientId ?? null;
      break;
    }
    case "Supplier": {
      const supplier = await db.supplier.findUnique({
        where: { id: context.id },
        select: { id: true },
      });
      supplierId = supplier?.id ?? null;
      break;
    }
    case "Client": {
      const client = await db.client.findUnique({
        where: { id: context.id },
        select: { id: true },
      });
      clientId = client?.id ?? null;
      break;
    }
  }
  if (scope === "PROJECT" && projectId) return { projectId };
  if (scope === "SUPPLIER" && supplierId) return { supplierId };
  if (scope === "CLIENT" && clientId) return { clientId };
  throw new AssistantQueryError(
    "That record has no available matching context. Give the Project, Supplier or Client name instead.",
  );
}
