"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  createEmployeeInputSchema,
  updateEmployeeInputSchema,
} from "@/domain/users/validation";
import { requireAdmin } from "@/lib/auth/current-user";
import {
  createEmployee,
  isDuplicateEmailError,
  isExpectedEmployeeUpdateError,
  updateEmployee,
} from "@/lib/users/employee-management";

export interface UserActionState {
  message?: string;
  status?: "error" | "success";
}

export const initialUserActionState: UserActionState = {};

function getFormString(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);

  return typeof value === "string" ? value : undefined;
}

function validationErrorState(error: z.ZodError): UserActionState {
  return {
    message:
      error.issues[0]?.message ?? "Check the entered details and try again.",
    status: "error",
  };
}

function unexpectedErrorState(): UserActionState {
  return {
    message: "We could not save this employee account. Please try again.",
    status: "error",
  };
}

export async function createEmployeeAction(
  _: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const administrator = await requireAdmin();
  const input = createEmployeeInputSchema.safeParse({
    email: getFormString(formData, "email"),
    name: getFormString(formData, "name"),
    password: getFormString(formData, "password"),
    role: getFormString(formData, "role"),
  });

  if (!input.success) {
    return validationErrorState(input.error);
  }

  try {
    await createEmployee(administrator.id, input.data);
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      return {
        message: "An employee account already uses this email address.",
        status: "error",
      };
    }

    console.error("Unable to create employee account.", error);
    return unexpectedErrorState();
  }

  revalidatePath("/admin/users");
  return { message: "Employee account created.", status: "success" };
}

export async function updateEmployeeAction(
  _: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const administrator = await requireAdmin();
  const input = updateEmployeeInputSchema.safeParse({
    email: getFormString(formData, "email"),
    id: getFormString(formData, "id"),
    isActive: formData.has("isActive"),
    name: getFormString(formData, "name"),
    role: getFormString(formData, "role"),
  });

  if (!input.success) {
    return validationErrorState(input.error);
  }

  try {
    await updateEmployee(administrator.id, input.data);
  } catch (error) {
    if (isDuplicateEmailError(error) || isExpectedEmployeeUpdateError(error)) {
      return {
        message:
          error instanceof Error
            ? error.message
            : "We could not update this employee account.",
        status: "error",
      };
    }

    console.error("Unable to update employee account.", error);
    return unexpectedErrorState();
  }

  revalidatePath("/admin/users");
  return { message: "Employee account updated.", status: "success" };
}
