"use server";

import { revalidatePath } from "next/cache";

import type { MasterDataActionState } from "@/components/master-data/action-state";
import type { BulkActionState } from "@/domain/deletion/action-state";
import { selectedIds, selectedIdsSchema } from "@/domain/deletion/validation";
import {
  createSupplierInputSchema,
  updateSupplierInputSchema,
} from "@/domain/master-data/validation";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { BulkDeletionError, deleteSuppliers } from "@/lib/deletion/bulk";
import {
  unexpectedActionError,
  validationActionError,
} from "@/lib/master-data/action-helpers";
import { isExpectedMasterDataError } from "@/lib/master-data/errors";
import { createSupplier, updateSupplier } from "@/lib/master-data/suppliers";

export async function createSupplierAction(
  _: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireMasterDataEditor();
  const input = createSupplierInputSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!input.success) return validationActionError(input.error);
  try {
    await createSupplier(actor.id, input.data);
  } catch (error) {
    if (isExpectedMasterDataError(error)) {
      return { message: error.message, status: "error" };
    }
    console.error("Unable to create supplier.", error);
    return unexpectedActionError("supplier");
  }
  revalidatePath("/suppliers");
  return { message: "Supplier created.", status: "success" };
}

export async function updateSupplierAction(
  _: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireMasterDataEditor();
  const input = updateSupplierInputSchema.safeParse({
    ...Object.fromEntries(formData),
    isActive: formData.has("isActive"),
  });
  if (!input.success) return validationActionError(input.error);
  try {
    await updateSupplier(actor.id, input.data);
  } catch (error) {
    if (isExpectedMasterDataError(error))
      return { message: error.message, status: "error" };
    console.error("Unable to update supplier.", error);
    return unexpectedActionError("supplier");
  }
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${input.data.id}`);
  revalidatePath("/orders");
  revalidatePath("/reports");
  return { message: "Supplier updated.", status: "success" };
}

export async function deleteSelectedSuppliersAction(
  formData: FormData,
): Promise<BulkActionState> {
  const actor = await requireMasterDataEditor();
  const input = selectedIdsSchema.safeParse(selectedIds(formData));
  if (!input.success) {
    return {
      message:
        input.error.issues[0]?.message ?? "Check the selected Suppliers.",
      status: "error",
    };
  }
  try {
    await deleteSuppliers(actor.id, input.data);
  } catch (error) {
    if (error instanceof BulkDeletionError) {
      return { message: error.message, status: "error" };
    }
    console.error("Unable to delete selected Suppliers.", error);
    return {
      message: "The selected Suppliers could not be deleted.",
      status: "error",
    };
  }
  revalidatePath("/suppliers");
  revalidatePath("/orders");
  revalidatePath("/payments");
  revalidatePath("/calendar");
  revalidatePath("/projects");
  revalidatePath("/reports");
  return {
    message: `${input.data.length} Supplier${input.data.length === 1 ? "" : "s"} deleted.`,
    status: "success",
  };
}
