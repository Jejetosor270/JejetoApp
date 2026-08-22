"use server";

import { revalidatePath } from "next/cache";

import type { MasterDataActionState } from "@/components/master-data/action-state";
import {
  createSupplierInputSchema,
  updateSupplierInputSchema,
} from "@/domain/master-data/validation";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
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
  return { message: "Supplier updated.", status: "success" };
}
