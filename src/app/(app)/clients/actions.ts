"use server";

import { revalidatePath } from "next/cache";

import type { MasterDataActionState } from "@/components/master-data/action-state";
import {
  unexpectedActionError,
  validationActionError,
} from "@/lib/master-data/action-helpers";
import {
  createClientInputSchema,
  updateClientInputSchema,
} from "@/domain/master-data/validation";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { isExpectedMasterDataError } from "@/lib/master-data/errors";
import { createClient, updateClient } from "@/lib/master-data/clients";

export async function createClientAction(
  _: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireMasterDataEditor();
  const input = createClientInputSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return validationActionError(input.error);
  try {
    await createClient(actor.id, input.data);
  } catch (error) {
    if (isExpectedMasterDataError(error)) {
      return { message: error.message, status: "error" };
    }
    console.error("Unable to create client.", error);
    return unexpectedActionError("client");
  }
  revalidatePath("/clients");
  revalidatePath("/projects");
  return { message: "Client created.", status: "success" };
}

export async function updateClientAction(
  _: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireMasterDataEditor();
  const input = updateClientInputSchema.safeParse({
    ...Object.fromEntries(formData),
    isActive: formData.has("isActive"),
  });
  if (!input.success) return validationActionError(input.error);
  try {
    await updateClient(actor.id, input.data);
  } catch (error) {
    if (isExpectedMasterDataError(error))
      return { message: error.message, status: "error" };
    console.error("Unable to update client.", error);
    return unexpectedActionError("client");
  }
  revalidatePath("/clients");
  revalidatePath("/projects");
  return { message: "Client updated.", status: "success" };
}
