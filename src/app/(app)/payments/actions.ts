"use server";

import { revalidatePath } from "next/cache";

import type { PaymentActionState } from "@/domain/payments/action-state";
import type { BulkActionState } from "@/domain/deletion/action-state";
import { selectedIds, selectedIdsSchema } from "@/domain/deletion/validation";
import {
  idFormValue,
  installmentFormValues,
  settlementFormValues,
} from "@/domain/payments/form-data";
import {
  createInstallmentSchema,
  inlineInstallmentSchema,
  installmentIdSchema,
  presetSchema,
  settlementIdSchema,
  settlementSchema,
  updateInstallmentSchema,
} from "@/domain/payments/validation";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { BulkDeletionError, deleteInstallments } from "@/lib/deletion/bulk";
import { isExpectedPaymentError } from "@/lib/payments/errors";
import { fieldErrorMap } from "@/domain/validation/issues";
import {
  applyPaymentPreset,
  cancelInstallment,
  createInstallment,
  markInstallmentSettled,
  recordSettlement,
  removeSettlement,
  removeUnpaidInstallment,
  updateInstallment,
  updateInstallmentInline,
} from "@/lib/payments/payments";
import { revalidateProjectFinancialViews } from "@/lib/reporting/revalidation";

function refreshPaymentViews(): void {
  revalidatePath("/payments");
  revalidatePath("/calendar");
  revalidatePath("/orders/[orderId]", "page");
  revalidateProjectFinancialViews();
}

function errorState(error: unknown): PaymentActionState {
  if (isExpectedPaymentError(error)) {
    return {
      formError: error.message,
      message: error.message,
      status: "error",
    };
  }
  console.error("Unable to update payment data.", error);
  return {
    formError: "We could not save the payment change. Please try again.",
    message: "We could not save the payment change. Please try again.",
    status: "error",
  };
}

export async function createInstallmentAction(
  _: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const actor = await requireMasterDataEditor();
  const input = createInstallmentSchema.safeParse(
    installmentFormValues(formData),
  );
  if (!input.success)
    return {
      fieldErrors: fieldErrorMap(input.error.issues),
      formError: input.error.issues[0]?.message ?? "Check the installment.",
      message: input.error.issues[0]?.message ?? "Check the installment.",
      status: "error",
    };
  try {
    await createInstallment(actor.id, input.data);
    refreshPaymentViews();
    return { message: "Installment added.", status: "success" };
  } catch (error) {
    return errorState(error);
  }
}

export async function updateInstallmentAction(
  _: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const actor = await requireMasterDataEditor();
  const input = updateInstallmentSchema.safeParse(
    installmentFormValues(formData),
  );
  if (!input.success)
    return {
      fieldErrors: fieldErrorMap(input.error.issues),
      formError: input.error.issues[0]?.message ?? "Check the installment.",
      message: input.error.issues[0]?.message ?? "Check the installment.",
      status: "error",
    };
  try {
    await updateInstallment(actor.id, input.data);
    refreshPaymentViews();
    return { message: "Installment updated.", status: "success" };
  } catch (error) {
    return errorState(error);
  }
}

export async function updateInstallmentInlineAction(formData: FormData) {
  const actor = await requireMasterDataEditor();
  const input = inlineInstallmentSchema.safeParse(Object.fromEntries(formData));
  if (!input.success)
    return {
      fieldErrors: fieldErrorMap(input.error.issues),
      formError: input.error.issues[0]?.message ?? "Check the settlement.",
      message: input.error.issues[0]?.message ?? "Check the installment.",
      status: "error" as const,
    };
  try {
    const values = await updateInstallmentInline(actor.id, input.data);
    refreshPaymentViews();
    return {
      message: "Installment values saved.",
      status: "success" as const,
      values,
    };
  } catch (error) {
    const state = errorState(error);
    return { ...state, status: "error" as const };
  }
}

export async function recordSettlementAction(
  _: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const actor = await requireMasterDataEditor();
  const input = settlementSchema.safeParse(settlementFormValues(formData));
  if (!input.success)
    return {
      fieldErrors: fieldErrorMap(input.error.issues),
      formError: input.error.issues[0]?.message ?? "Check the schedule preset.",
      message: input.error.issues[0]?.message ?? "Check the settlement.",
      status: "error",
    };
  try {
    await recordSettlement(actor.id, input.data);
    refreshPaymentViews();
    return { message: "Settlement recorded.", status: "success" };
  } catch (error) {
    return errorState(error);
  }
}

export async function markInstallmentSettledAction(
  _: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const actor = await requireMasterDataEditor();
  const input = installmentIdSchema.safeParse(
    idFormValue(formData, "installmentId"),
  );
  if (!input.success)
    return { message: "Invalid installment.", status: "error" };
  try {
    await markInstallmentSettled(actor.id, input.data.installmentId);
    refreshPaymentViews();
    return { message: "Installment settled in full.", status: "success" };
  } catch (error) {
    return errorState(error);
  }
}

export async function cancelInstallmentAction(
  _: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const actor = await requireMasterDataEditor();
  const input = installmentIdSchema.safeParse(
    idFormValue(formData, "installmentId"),
  );
  if (!input.success)
    return { message: "Invalid installment.", status: "error" };
  try {
    await cancelInstallment(actor.id, input.data.installmentId);
    refreshPaymentViews();
    return { message: "Installment cancelled.", status: "success" };
  } catch (error) {
    return errorState(error);
  }
}

export async function removeInstallmentAction(
  _: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const actor = await requireMasterDataEditor();
  const input = installmentIdSchema.safeParse(
    idFormValue(formData, "installmentId"),
  );
  if (!input.success)
    return { message: "Invalid installment.", status: "error" };
  try {
    await removeUnpaidInstallment(actor.id, input.data.installmentId);
    refreshPaymentViews();
    return { message: "Unpaid installment removed.", status: "success" };
  } catch (error) {
    return errorState(error);
  }
}

export async function removeSettlementAction(
  _: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const actor = await requireMasterDataEditor();
  const input = settlementIdSchema.safeParse(
    idFormValue(formData, "settlementId"),
  );
  if (!input.success)
    return { message: "Invalid settlement.", status: "error" };
  try {
    await removeSettlement(actor.id, input.data.settlementId);
    refreshPaymentViews();
    return { message: "Settlement correction removed.", status: "success" };
  } catch (error) {
    return errorState(error);
  }
}

export async function applyPaymentPresetAction(
  _: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const actor = await requireMasterDataEditor();
  const input = presetSchema.safeParse({
    direction: formData.get("direction"),
    firstDueDate: formData.get("firstDueDate"),
    orderId: formData.get("orderId"),
    preset: formData.get("preset"),
  });
  if (!input.success)
    return {
      message: input.error.issues[0]?.message ?? "Check the schedule preset.",
      status: "error",
    };
  try {
    await applyPaymentPreset(actor.id, input.data);
    refreshPaymentViews();
    return { message: "Schedule preset added.", status: "success" };
  } catch (error) {
    return errorState(error);
  }
}

export async function deleteSelectedInstallmentsAction(
  formData: FormData,
): Promise<BulkActionState> {
  const actor = await requireMasterDataEditor();
  const input = selectedIdsSchema.safeParse(selectedIds(formData));
  if (!input.success) {
    return {
      message:
        input.error.issues[0]?.message ?? "Check the selected installments.",
      status: "error",
    };
  }
  try {
    await deleteInstallments(actor.id, input.data);
    refreshPaymentViews();
    return {
      message: `${input.data.length} installment${input.data.length === 1 ? "" : "s"} deleted.`,
      status: "success",
    };
  } catch (error) {
    if (error instanceof BulkDeletionError) {
      return { message: error.message, status: "error" };
    }
    console.error("Unable to delete selected installments.", error);
    return {
      message: "The selected installments could not be deleted.",
      status: "error",
    };
  }
}
