"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { moveToTrash, restoreTrash, TrashError } from "@/lib/trash/service";
import { selectedIds, selectedIdsSchema } from "@/domain/deletion/validation";
import type { BulkActionState } from "@/domain/deletion/action-state";

const kinds = {
  project: "Project",
  client: "Client",
  supplier: "Supplier",
  order: "ProcurementOrder",
  building: "Building",
  room: "Room",
  item: "Item",
  package: "OrderPackage",
  billing: "ClientBillingDocument",
  payment: "PaymentSettlement",
  receipt: "ClientReceipt",
  "supplier-installment": "PaymentInstallment",
  "client-installment": "ClientPaymentInstallment",
} as const;
export async function trashSelectedAction(
  kind: keyof typeof kinds,
  formData: FormData,
): Promise<BulkActionState> {
  const actor = await requireMasterDataEditor();
  const parsed = z
    .enum([
      "project",
      "client",
      "supplier",
      "order",
      "building",
      "room",
      "item",
      "package",
      "billing",
      "payment",
      "receipt",
      "supplier-installment",
      "client-installment",
    ])
    .safeParse(kind);
  const ids = selectedIdsSchema.safeParse(selectedIds(formData));
  if (!parsed.success || !ids.success)
    return { status: "error", message: "Select valid records." };
  try {
    await moveToTrash(actor.id, kinds[parsed.data], ids.data);
    revalidatePath("/", "layout");
    return {
      status: "success",
      message: "Moved to Trash. You can restore these records in Settings.",
    };
  } catch (error) {
    if (!(error instanceof TrashError))
      console.error("Unable to move records to Trash.", error);
    return {
      status: "error",
      message:
        error instanceof TrashError
          ? error.message
          : "The records could not be moved to Trash.",
    };
  }
}
export async function restoreTrashAction(
  formData: FormData,
): Promise<BulkActionState> {
  const actor = await requireMasterDataEditor();
  const parsed = z.uuid().safeParse(formData.get("batchId"));
  if (!parsed.success)
    return { status: "error", message: "Select a valid Trash group." };
  try {
    await restoreTrash(actor.id, parsed.data);
    revalidatePath("/", "layout");
    return { status: "success", message: "Records restored." };
  } catch (error) {
    if (!(error instanceof TrashError))
      console.error("Unable to restore Trash.", error);
    return {
      status: "error",
      message:
        error instanceof TrashError
          ? error.message
          : "The records could not be restored. Refresh and try again.",
    };
  }
}
