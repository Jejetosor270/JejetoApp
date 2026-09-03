"use server";

import { revalidatePath } from "next/cache";

import type { MasterDataActionState } from "@/components/master-data/action-state";
import type { BulkActionState } from "@/domain/deletion/action-state";
import { selectedIds, selectedIdsSchema } from "@/domain/deletion/validation";
import {
  unexpectedActionError,
  validationActionError,
} from "@/lib/master-data/action-helpers";
import {
  createClientInputSchema,
  updateClientInputSchema,
} from "@/domain/master-data/validation";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { BulkDeletionError, deleteClients } from "@/lib/deletion/bulk";
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
  revalidatePath(`/clients/${input.data.id}`);
  revalidatePath("/projects");
  revalidatePath("/reports");
  return { message: "Client updated.", status: "success" };
}

export async function deleteSelectedClientsAction(
  formData: FormData,
): Promise<BulkActionState> {
  const actor = await requireMasterDataEditor();
  const input = selectedIdsSchema.safeParse(selectedIds(formData));
  if (!input.success) {
    return {
      message: input.error.issues[0]?.message ?? "Check the selected Clients.",
      status: "error",
    };
  }
  try {
    await deleteClients(actor.id, input.data);
  } catch (error) {
    if (error instanceof BulkDeletionError) {
      return { message: error.message, status: "error" };
    }
    console.error("Unable to delete selected Clients.", error);
    return {
      message: "The selected Clients could not be deleted.",
      status: "error",
    };
  }
  revalidatePath("/clients");
  revalidatePath("/projects");
  revalidatePath("/orders");
  revalidatePath("/payments");
  revalidatePath("/calendar");
  revalidatePath("/reports");
  return {
    message: `${input.data.length} Client${input.data.length === 1 ? "" : "s"} deleted.`,
    status: "success",
  };
}
