"use server";

import { revalidatePath } from "next/cache";

import type { OrderActionState } from "@/components/procurement/action-state";
import type { BulkActionState } from "@/domain/deletion/action-state";
import { selectedIds, selectedIdsSchema } from "@/domain/deletion/validation";
import { orderFormValues } from "@/domain/procurement/form-data";
import {
  createOrderInputSchema,
  updateOrderInputSchema,
} from "@/domain/procurement/validation";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { BulkDeletionError, deleteOrders } from "@/lib/deletion/bulk";
import {
  isDuplicateOrderReferenceError,
  isExpectedProcurementError,
} from "@/lib/procurement/errors";
import { createOrder, updateOrder } from "@/lib/procurement/orders";

function errorState(error: unknown): OrderActionState {
  if (isDuplicateOrderReferenceError(error)) {
    return {
      message: "A procurement order already uses this internal reference.",
      status: "error",
    };
  }
  if (isExpectedProcurementError(error))
    return { message: error.message, status: "error" };
  console.error("Unable to save procurement order.", error);
  return {
    message: "We could not save this procurement order. Please try again.",
    status: "error",
  };
}

export async function createOrderAction(
  _: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const actor = await requireMasterDataEditor();
  const input = createOrderInputSchema.safeParse(orderFormValues(formData));
  if (!input.success)
    return {
      message:
        input.error.issues[0]?.message ?? "Check the entered order details.",
      status: "error",
    };
  try {
    const orderId = await createOrder(actor.id, input.data);
    revalidatePath("/orders");
    revalidatePath("/calendar");
    revalidatePath(`/projects/${input.data.projectId}`);
    return {
      message: "Procurement order created.",
      orderId,
      status: "success",
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function updateOrderAction(
  _: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const actor = await requireMasterDataEditor();
  const values = orderFormValues(formData);
  const id = formData.get("id");
  const input = updateOrderInputSchema.safeParse({
    ...values,
    id: typeof id === "string" ? id : undefined,
  });
  if (!input.success)
    return {
      message:
        input.error.issues[0]?.message ?? "Check the entered order details.",
      status: "error",
    };
  try {
    await updateOrder(actor.id, input.data);
    revalidatePath("/orders");
    revalidatePath("/calendar");
    revalidatePath(`/orders/${input.data.id}`);
    revalidatePath(`/projects/${input.data.projectId}`);
    return {
      message: "Procurement order updated.",
      orderId: input.data.id,
      status: "success",
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function deleteSelectedOrdersAction(
  formData: FormData,
): Promise<BulkActionState> {
  await requireMasterDataEditor();
  const input = selectedIdsSchema.safeParse(selectedIds(formData));
  if (!input.success) {
    return {
      message: input.error.issues[0]?.message ?? "Check the selected Orders.",
      status: "error",
    };
  }
  try {
    await deleteOrders(input.data);
    revalidatePath("/orders");
    revalidatePath("/calendar");
    revalidatePath("/projects");
    revalidatePath("/reports");
    revalidatePath("/payments");
    return {
      message: `${input.data.length} Order${input.data.length === 1 ? "" : "s"} deleted.`,
      status: "success",
    };
  } catch (error) {
    if (error instanceof BulkDeletionError) {
      return { message: error.message, status: "error" };
    }
    console.error("Unable to delete selected Orders.", error);
    return {
      message: "The selected Orders could not be deleted.",
      status: "error",
    };
  }
}
