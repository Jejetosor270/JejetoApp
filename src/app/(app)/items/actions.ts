"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { optionalPercentageFraction } from "@/domain/validation/percentage";

import type { BulkActionState } from "@/domain/deletion/action-state";
import type { ItemActionState } from "@/domain/items/action-state";
import { selectedIds, selectedIdsSchema } from "@/domain/deletion/validation";
import {
  createItemInputSchema,
  createLocationInputSchema,
  createRoomInputSchema,
  inlineItemFinancialInputSchema,
  inlineItemGeneralInputSchema,
  inlineItemStatusInputSchema,
  inlineItemTrackingInputSchema,
  updateItemInputSchema,
  updateLocationInlineInputSchema,
  updateRoomInlineInputSchema,
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
  updateItemFinancialInline,
  updateItemGeneralInline,
  updateItemStatusInline,
  updateItemTrackingInline,
  updateLocationInline,
  updateRoomInline,
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
    vatRate: optionalPercentageFraction({
      label: "VAT rate",
      maximumPercent: "100",
    }),
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
    const room = await createRoom(actor.id, input.data);
    refresh();
    revalidatePath("/items", "layout");
    return {
      message: "Room created and selected.",
      room: { ...room, buildingId: input.data.buildingId },
      status: "success",
    };
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

export async function updateRoomInlineAction(formData: FormData) {
  const actor = await requireMasterDataEditor();
  const input = updateRoomInlineInputSchema.safeParse({
    ...formValues(formData),
    isActive: formData.has("isActive"),
  });
  if (!input.success)
    return {
      message: input.error.issues[0]?.message ?? "Check the Room.",
      status: "error" as const,
    };
  try {
    const values = await updateRoomInline(actor.id, input.data);
    revalidatePath("/projects/[projectId]", "page");
    revalidatePath("/items");
    return { message: "Room saved.", status: "success" as const, values };
  } catch (error) {
    const state = errorState(error);
    return { ...state, status: "error" as const };
  }
}

export async function updateLocationInlineAction(formData: FormData) {
  const actor = await requireMasterDataEditor();
  const input = updateLocationInlineInputSchema.safeParse({
    ...formValues(formData),
    isActive: formData.has("isActive"),
  });
  if (!input.success)
    return {
      message: input.error.issues[0]?.message ?? "Check the Location.",
      status: "error" as const,
    };
  try {
    const values = await updateLocationInline(actor.id, input.data);
    revalidatePath("/settings");
    revalidatePath("/items");
    return { message: "Location saved.", status: "success" as const, values };
  } catch (error) {
    const state = errorState(error);
    return { ...state, status: "error" as const };
  }
}

export async function updateItemFinancialInlineAction(formData: FormData) {
  const actor = await requireMasterDataEditor();
  const input = inlineItemFinancialInputSchema.safeParse(formValues(formData));
  if (!input.success)
    return {
      message: input.error.issues[0]?.message ?? "Check the financial values.",
      status: "error" as const,
    };
  try {
    const values = await updateItemFinancialInline(actor.id, input.data);
    refresh();
    revalidatePath(`/items/${input.data.id}`);
    return {
      message: "Financial values saved.",
      status: "success" as const,
      values,
    };
  } catch (error) {
    const state = errorState(error);
    return { ...state, status: "error" as const };
  }
}

export async function updateItemGeneralInlineAction(formData: FormData) {
  const actor = await requireMasterDataEditor();
  const input = inlineItemGeneralInputSchema.safeParse(formValues(formData));
  if (!input.success)
    return {
      message: input.error.issues[0]?.message ?? "Check the Item values.",
      status: "error" as const,
    };
  try {
    const values = await updateItemGeneralInline(actor.id, input.data);
    refresh();
    revalidatePath(`/items/${input.data.id}`);
    return {
      message: "Item values saved.",
      status: "success" as const,
      values,
    };
  } catch (error) {
    const state = errorState(error);
    return { ...state, status: "error" as const };
  }
}

export async function updateItemStatusInlineAction(formData: FormData) {
  const actor = await requireMasterDataEditor();
  const input = inlineItemStatusInputSchema.safeParse(formValues(formData));
  if (!input.success)
    return {
      message: input.error.issues[0]?.message ?? "Check the statuses.",
      status: "error" as const,
    };
  try {
    await updateItemStatusInline(actor.id, input.data);
    refresh();
    return { message: "Statuses saved.", status: "success" as const };
  } catch (error) {
    const state = errorState(error);
    return { ...state, status: "error" as const };
  }
}

export async function updateItemTrackingInlineAction(formData: FormData) {
  const actor = await requireMasterDataEditor();
  const input = inlineItemTrackingInputSchema.safeParse(formValues(formData));
  if (!input.success)
    return {
      message: input.error.issues[0]?.message ?? "Check the tracking values.",
      status: "error" as const,
    };
  try {
    await updateItemTrackingInline(actor.id, input.data);
    refresh();
    return { message: "Tracking saved.", status: "success" as const };
  } catch (error) {
    const state = errorState(error);
    return { ...state, status: "error" as const };
  }
}
