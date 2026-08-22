"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type {
  UpdatedEmployeeActionData,
  UserActionState,
} from "@/app/(app)/admin/users/action-state";
import {
  createEmployeeInputSchema,
  resetEmployeePasswordInputSchema,
  updateEmployeeInputSchema,
} from "@/domain/users/validation";
import { requireAdmin } from "@/lib/auth/current-user";
import {
  createEmployee,
  isDuplicateEmailError,
  isExpectedEmployeeUpdateError,
  resetEmployeePassword,
  updateEmployee,
} from "@/lib/users/employee-management";

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

function toUpdatedEmployeeActionData(employee: {
  email: string;
  id: string;
  isActive: boolean;
  name: string;
  role: "ADMIN" | "MANAGER" | "USER";
}): UpdatedEmployeeActionData {
  return employee;
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
    const employee = await updateEmployee(administrator.id, input.data);
    revalidatePath("/admin/users");
    return {
      employee: toUpdatedEmployeeActionData(employee),
      message: "Employee account updated.",
      status: "success",
    };
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
}

export async function resetEmployeePasswordAction(
  _: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const administrator = await requireAdmin();
  const input = resetEmployeePasswordInputSchema.safeParse({
    id: getFormString(formData, "id"),
    password: getFormString(formData, "password"),
    passwordConfirmation: getFormString(formData, "passwordConfirmation"),
  });

  if (!input.success) {
    return validationErrorState(input.error);
  }

  try {
    await resetEmployeePassword(administrator.id, input.data);
  } catch (error) {
    if (isExpectedEmployeeUpdateError(error)) {
      return {
        message: error instanceof Error ? error.message : "Employee not found.",
        status: "error",
      };
    }

    console.error("Unable to reset employee password.", error);
    return {
      message: "We could not update this password. Please try again.",
      status: "error",
    };
  }

  revalidatePath("/admin/users");
  return { message: "Password updated.", status: "success" };
}
