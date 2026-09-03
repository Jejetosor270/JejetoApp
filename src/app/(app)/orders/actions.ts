"use server";

import { revalidatePath } from "next/cache";

import type { OrderActionState } from "@/components/procurement/action-state";
import type { BulkActionState } from "@/domain/deletion/action-state";
import { selectedIds, selectedIdsSchema } from "@/domain/deletion/validation";
import { orderFormValues } from "@/domain/procurement/form-data";
import {
  createOrderInputSchema,
  inlineOrderInputSchema,
  updateOrderInputSchema,
} from "@/domain/procurement/validation";
import { parseOrderCreationBillingLink } from "@/domain/billing/validation";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { BulkDeletionError, deleteOrders } from "@/lib/deletion/bulk";
import {
  isDuplicateOrderReferenceError,
  isExpectedProcurementError,
} from "@/lib/procurement/errors";
import {
  createOrder,
  createOrderInTransaction,
  updateOrder,
  updateOrderInline,
} from "@/lib/procurement/orders";
import { orderFieldErrors } from "@/domain/procurement/action-errors";
import {
  ClientBillingNotFoundError,
  ClientBillingValidationError,
  updateOrderBillingLinkInTransaction,
} from "@/lib/billing/billing";
import { getDatabase } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { revalidateProjectFinancialViews } from "@/lib/reporting/revalidation";

function errorState(error: unknown): OrderActionState {
  if (isDuplicateOrderReferenceError(error)) {
    return {
      fieldErrors: {
        orderNumber: "This internal reference is already in use.",
      },
      message: "A procurement order already uses this internal reference.",
      status: "error",
    };
  }
  if (isExpectedProcurementError(error))
    return {
      formError: error.message,
      message: error.message,
      status: "error",
    };
  if (
    error instanceof ClientBillingValidationError ||
    error instanceof ClientBillingNotFoundError
  )
    return {
      formError:
        error.message || "The selected Billing Event no longer exists.",
      message: error.message || "The selected Billing Event no longer exists.",
      status: "error",
    };
  console.error("Unable to save procurement order.", error);
  return {
    formError: "We could not save this procurement order. Please try again.",
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
      fieldErrors: orderFieldErrors(input.error.issues),
      formError: "Review the highlighted fields and try again.",
      message: "Review the highlighted fields and try again.",
      status: "error",
    };
  const billingLink = parseOrderCreationBillingLink(formData);
  if (!billingLink.success)
    return {
      fieldErrors: Object.fromEntries(
        billingLink.error.issues.map((issue) => [
          issue.path[0] === "allocatedAmount"
            ? "billingAllocatedAmount"
            : issue.path[0] === "percentageRate"
              ? "billingPercentageRate"
              : String(issue.path[0] ?? "billingDocumentId"),
          issue.message,
        ]),
      ),
      formError: "Check the optional Client Billing allocation.",
      message: "Check the optional Client Billing allocation.",
      status: "error",
    };
  try {
    const orderId = billingLink.data
      ? await getDatabase().$transaction(
          async (transaction) => {
            const createdOrderId = await createOrderInTransaction(
              transaction,
              actor.id,
              input.data,
            );
            await updateOrderBillingLinkInTransaction(transaction, actor.id, {
              ...billingLink.data,
              orderId: createdOrderId,
              remove: false,
            });
            return createdOrderId;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        )
      : await createOrder(actor.id, input.data);
    revalidatePath("/orders");
    revalidatePath("/calendar");
    revalidateProjectFinancialViews(input.data.projectId);
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
      fieldErrors: orderFieldErrors(input.error.issues),
      formError: "Review the highlighted fields and try again.",
      message: "Review the highlighted fields and try again.",
      status: "error",
    };
  try {
    await updateOrder(actor.id, input.data);
    revalidatePath("/orders");
    revalidatePath("/calendar");
    revalidatePath(`/orders/${input.data.id}`);
    revalidateProjectFinancialViews(input.data.projectId);
    return {
      message: "Procurement order updated.",
      orderId: input.data.id,
      status: "success",
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function updateOrderInlineAction(formData: FormData) {
  const actor = await requireMasterDataEditor();
  const input = inlineOrderInputSchema.safeParse(Object.fromEntries(formData));
  if (!input.success)
    return {
      message: input.error.issues[0]?.message ?? "Check the Order values.",
      status: "error" as const,
    };
  try {
    const values = await updateOrderInline(actor.id, input.data);
    revalidatePath("/orders");
    revalidatePath("/calendar");
    revalidatePath(`/orders/${input.data.id}`);
    revalidateProjectFinancialViews();
    return {
      message: "Order values saved.",
      status: "success" as const,
      values,
    };
  } catch (error) {
    const state = errorState(error);
    return { ...state, status: "error" as const };
  }
}

export async function deleteSelectedOrdersAction(
  formData: FormData,
): Promise<BulkActionState> {
  const actor = await requireMasterDataEditor();
  const input = selectedIdsSchema.safeParse(selectedIds(formData));
  if (!input.success) {
    return {
      message: input.error.issues[0]?.message ?? "Check the selected Orders.",
      status: "error",
    };
  }
  try {
    await deleteOrders(actor.id, input.data);
    revalidatePath("/orders");
    revalidatePath("/calendar");
    revalidateProjectFinancialViews();
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
