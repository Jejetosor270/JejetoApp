"use server";
import { revalidatePath } from "next/cache";
import type { MasterDataActionState } from "@/components/master-data/action-state";
import {
  packageInputSchema,
  packageAssignmentSchema,
} from "@/domain/packages/validation";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import {
  assignPackage,
  savePackage,
  PackageValidationError,
} from "@/lib/packages/packages";
import { validationActionError } from "@/lib/master-data/action-helpers";

export async function savePackageAction(
  _: MasterDataActionState,
  formData: FormData,
): Promise<
  MasterDataActionState & {
    record?: { id: string; name: string; isActive: boolean };
  }
> {
  const actor = await requireMasterDataEditor();
  const parsed = packageInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationActionError(parsed.error);
  try {
    const record = await savePackage(actor.id, parsed.data);
    revalidatePath(`/projects/${parsed.data.projectId}`);
    revalidatePath("/orders");
    return { status: "success", message: "Package saved.", record };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof PackageValidationError
          ? error.message
          : "Package could not be saved. Your draft is still available.",
    };
  }
}

export async function assignPackageAction(
  _: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireMasterDataEditor();
  const parsed = packageAssignmentSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) return validationActionError(parsed.error);
  try {
    await assignPackage(actor.id, parsed.data);
    revalidatePath(`/projects/${parsed.data.projectId}`);
    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.data.orderId}`);
    return { status: "success", message: "Package assignment saved." };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof PackageValidationError
          ? error.message
          : "Assignment could not be saved. Please retry.",
    };
  }
}
