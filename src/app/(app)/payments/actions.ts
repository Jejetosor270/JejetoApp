"use server";

import { revalidatePath } from "next/cache";

import type { PaymentActionState } from "@/domain/payments/action-state";
import {
  idFormValue,
  installmentFormValues,
  settlementFormValues,
} from "@/domain/payments/form-data";
import {
  createInstallmentSchema,
  installmentIdSchema,
  presetSchema,
  settlementIdSchema,
  settlementSchema,
  updateInstallmentSchema,
} from "@/domain/payments/validation";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { isExpectedPaymentError } from "@/lib/payments/errors";
import {
  applyPaymentPreset,
  cancelInstallment,
  createInstallment,
  markInstallmentSettled,
  recordSettlement,
  removeSettlement,
  removeUnpaidInstallment,
  updateInstallment,
} from "@/lib/payments/payments";

function refreshPaymentViews(): void {
  revalidatePath("/payments");
  revalidatePath("/calendar");
  revalidatePath("/orders/[orderId]", "page");
  revalidatePath("/projects/[projectId]", "page");
}

function errorState(error: unknown): PaymentActionState {
  if (isExpectedPaymentError(error)) {
    return { message: error.message, status: "error" };
  }
  console.error("Unable to update payment data.", error);
  return {
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

export async function recordSettlementAction(
  _: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const actor = await requireMasterDataEditor();
  const input = settlementSchema.safeParse(settlementFormValues(formData));
  if (!input.success)
    return {
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
  await requireMasterDataEditor();
  const input = installmentIdSchema.safeParse(
    idFormValue(formData, "installmentId"),
  );
  if (!input.success)
    return { message: "Invalid installment.", status: "error" };
  try {
    await removeUnpaidInstallment(input.data.installmentId);
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
  await requireMasterDataEditor();
  const input = settlementIdSchema.safeParse(
    idFormValue(formData, "settlementId"),
  );
  if (!input.success)
    return { message: "Invalid settlement.", status: "error" };
  try {
    await removeSettlement(input.data.settlementId);
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
