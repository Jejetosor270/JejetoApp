"use server";

import { z } from "zod";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { getPaymentTermEditorData } from "@/lib/payments/term-editor";

export async function loadPaymentTermEditorAction(raw: unknown) {
  await requireMasterDataEditor();
  const input = z
    .object({ id: z.uuid(), kind: z.enum(["supplier", "client"]) })
    .safeParse(raw);
  if (!input.success)
    return { data: null, error: "Select a valid payment term." };
  try {
    const data = await getPaymentTermEditorData(input.data.kind, input.data.id);
    return data
      ? { data, error: null }
      : {
          data: null,
          error:
            "This term is no longer linked to an available Order or Billing record.",
        };
  } catch {
    return {
      data: null,
      error: "The payment term could not be loaded. Please try again.",
    };
  }
}
