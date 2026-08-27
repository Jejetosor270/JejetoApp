"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { BulkActionState } from "@/domain/deletion/action-state";
import type { ItemActionState } from "@/domain/items/action-state";
import { selectedIds, selectedIdsSchema } from "@/domain/deletion/validation";
import {
  createItemInputSchema,
  createLocationInputSchema,
  createRoomInputSchema,
  updateItemInputSchema,
} from "@/domain/items/validation";
import {
  ItemCommercialStatus,
  ItemLogisticsStatus,
} from "@/generated/prisma/client";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import {
  bulkUpdateItems,
  createItem,
  createLogisticsLocation,
  createRoom,
  deleteItems,
  ItemValidationError,
  updateItem,
} from "@/lib/items/items";

function formValues(formData: FormData) {
  return Object.fromEntries(formData);
}

function errorState(error: unknown): ItemActionState {
  if (error instanceof ItemValidationError)
    return { message: error.message, status: "error" };
  console.error("Unable to save Item data.", error);
  return {
    message: "The Item could not be saved. Please try again.",
    status: "error",
  };
}

function refresh(projectId?: string) {
  revalidatePath("/items");
  revalidatePath("/items/import");
  revalidatePath("/orders/import");
  revalidatePath("/calendar");
  revalidatePath("/search");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

export async function createItemAction(
  _: ItemActionState,
  formData: FormData,
): Promise<ItemActionState> {
  const actor = await requireMasterDataEditor();
  const input = createItemInputSchema.safeParse(formValues(formData));
  if (!input.success)
    return {
      message: input.error.issues[0]?.message ?? "Check the Item.",
      status: "error",
    };
  try {
    const itemId = await createItem(actor.id, input.data);
    refresh(input.data.projectId);
    return { itemId, message: "Item created.", status: "success" };
  } catch (error) {
    return errorState(error);
  }
}

export async function updateItemAction(
  _: ItemActionState,
  formData: FormData,
): Promise<ItemActionState> {
  const actor = await requireMasterDataEditor();
  const input = updateItemInputSchema.safeParse(formValues(formData));
  if (!input.success)
    return {
      message: input.error.issues[0]?.message ?? "Check the Item.",
      status: "error",
    };
  try {
    await updateItem(actor.id, input.data);
    refresh(input.data.projectId);
    revalidatePath(`/items/${input.data.id}`);
    return {
      itemId: input.data.id,
      message: "Item updated.",
      status: "success",
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function deleteSelectedItemsAction(
  formData: FormData,
): Promise<BulkActionState> {
  const actor = await requireMasterDataEditor();
  const input = selectedIdsSchema.safeParse(selectedIds(formData));
  if (!input.success)
    return {
      message: input.error.issues[0]?.message ?? "Check the selection.",
      status: "error",
    };
  try {
    await deleteItems(actor.id, input.data);
    refresh();
    return {
      message: `${input.data.length} Item${input.data.length === 1 ? "" : "s"} deleted.`,
      status: "success",
    };
  } catch (error) {
    return {
      message:
        error instanceof ItemValidationError
          ? error.message
          : "The selected Items could not be deleted.",
      status: "error",
    };
  }
}

const bulkSchema = z
  .object({
    buildingId: z.uuid().optional(),
    category: z.string().trim().max(80).optional(),
    commercialStatus: z.enum(ItemCommercialStatus).optional(),
    logisticsStatus: z.enum(ItemLogisticsStatus).optional(),
    projectId: z.uuid().optional(),
    roomId: z.uuid().optional(),
    supplierId: z.uuid().optional(),
    vatRate: z
      .string()
      .trim()
      .regex(/^(?:0|[1-9]\d?|100)(?:\.\d{1,4})?$/)
      .transform((value) => new Decimal(value).dividedBy(100).toFixed(6))
      .optional(),
  })
  .refine(
    (value) => Object.values(value).some(Boolean),
    "Choose a field to update.",
  );

export async function bulkUpdateItemsAction(
  formData: FormData,
): Promise<BulkActionState> {
  const actor = await requireMasterDataEditor();
  const ids = selectedIdsSchema.safeParse(selectedIds(formData));
  const raw = Object.fromEntries(formData);
  const field = typeof raw.field === "string" ? raw.field : "";
  const value = typeof raw.value === "string" ? raw.value : "";
  const input = bulkSchema.safeParse(value ? { [field]: value } : {});
  if (!ids.success)
    return { message: "Check the selected Items.", status: "error" };
  if (!input.success)
    return {
      message: input.error.issues[0]?.message ?? "Check the update.",
      status: "error",
    };
  try {
    await bulkUpdateItems(actor.id, ids.data, input.data);
    refresh();
    return {
      message: `${ids.data.length} Item${ids.data.length === 1 ? "" : "s"} updated.`,
      status: "success",
    };
  } catch (error) {
    return {
      message:
        error instanceof ItemValidationError
          ? error.message
          : "The selected Items could not be updated.",
      status: "error",
    };
  }
}

export async function createRoomAction(
  _: ItemActionState,
  formData: FormData,
): Promise<ItemActionState> {
  const actor = await requireMasterDataEditor();
  const input = createRoomInputSchema.safeParse(formValues(formData));
  if (!input.success)
    return {
      message: input.error.issues[0]?.message ?? "Check the Room.",
      status: "error",
    };
  try {
    await createRoom(actor.id, input.data);
    refresh();
    return { message: "Room created.", status: "success" };
  } catch (error) {
    return errorState(error);
  }
}

export async function createLocationAction(
  _: ItemActionState,
  formData: FormData,
): Promise<ItemActionState> {
  const actor = await requireMasterDataEditor();
  const input = createLocationInputSchema.safeParse(formValues(formData));
  if (!input.success)
    return {
      message: input.error.issues[0]?.message ?? "Check the Location.",
      status: "error",
    };
  try {
    await createLogisticsLocation(actor.id, input.data);
    revalidatePath("/settings");
    revalidatePath("/items");
    return { message: "Location created.", status: "success" };
  } catch (error) {
    return errorState(error);
  }
}
