"use server";

import { revalidatePath } from "next/cache";

import type { MasterDataActionState } from "@/components/master-data/action-state";
import {
  createBuildingInputSchema,
  updateBuildingInputSchema,
  updateProjectInputSchema,
} from "@/domain/master-data/validation";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import {
  projectFreightExpenseIdSchema,
  projectFreightExpenseSchema,
  updateProjectFreightExpenseSchema,
} from "@/domain/freight/validation";
import { fieldErrorMap } from "@/domain/validation/issues";
import {
  createProjectFreightExpense,
  deleteProjectFreightExpense,
  ProjectFreightExpenseError,
  updateProjectFreightExpense,
} from "@/lib/freight/expenses";
import {
  unexpectedActionError,
  validationActionError,
} from "@/lib/master-data/action-helpers";
import {
  isDuplicateMasterDataError,
  isExpectedMasterDataError,
} from "@/lib/master-data/errors";
import {
  createBuilding,
  updateBuilding,
  updateProject,
} from "@/lib/master-data/projects";
import { revalidateProjectFinancialViews } from "@/lib/reporting/revalidation";

function revalidateProject(projectId: string): void {
  revalidatePath("/projects");
  revalidateProjectFinancialViews(projectId);
}

export async function updateProjectFreightExpenseAction(
  _: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireMasterDataEditor();
  const input = updateProjectFreightExpenseSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!input.success) return validationActionError(input.error);
  try {
    await updateProjectFreightExpense(actor.id, input.data);
    revalidateProject(input.data.projectId);
    return { message: "Project freight expense updated.", status: "success" };
  } catch (error) {
    if (error instanceof ProjectFreightExpenseError)
      return {
        formError: error.message,
        message: error.message,
        status: "error",
      };
    console.error("Unable to update Project freight expense.", error);
    return unexpectedActionError("Project freight expense");
  }
}

export async function createProjectFreightExpenseAction(
  _: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireMasterDataEditor();
  const input = projectFreightExpenseSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!input.success) return validationActionError(input.error);
  try {
    await createProjectFreightExpense(actor.id, input.data);
    revalidateProject(input.data.projectId);
    return { message: "Project freight expense added.", status: "success" };
  } catch (error) {
    if (error instanceof ProjectFreightExpenseError)
      return {
        formError: error.message,
        message: error.message,
        status: "error",
      };
    console.error("Unable to create Project freight expense.", error);
    return unexpectedActionError("Project freight expense");
  }
}

export async function deleteProjectFreightExpenseAction(
  _: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireMasterDataEditor();
  const input = projectFreightExpenseIdSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!input.success)
    return {
      fieldErrors: fieldErrorMap(input.error.issues),
      message: input.error.issues[0]?.message ?? "Select a freight expense.",
      status: "error",
    };
  try {
    const projectId = await deleteProjectFreightExpense(
      actor.id,
      input.data.id,
    );
    revalidateProject(projectId);
    return { message: "Project freight expense deleted.", status: "success" };
  } catch (error) {
    if (error instanceof ProjectFreightExpenseError)
      return {
        formError: error.message,
        message: error.message,
        status: "error",
      };
    console.error("Unable to delete Project freight expense.", error);
    return unexpectedActionError("Project freight expense");
  }
}

export async function updateProjectAction(
  _: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireMasterDataEditor();
  const input = updateProjectInputSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!input.success) return validationActionError(input.error);
  try {
    await updateProject(actor.id, input.data);
  } catch (error) {
    if (isDuplicateMasterDataError(error))
      return { message: "A project already uses this code.", status: "error" };
    if (isExpectedMasterDataError(error))
      return { message: error.message, status: "error" };
    console.error("Unable to update project.", error);
    return unexpectedActionError("project");
  }
  revalidateProject(input.data.id);
  return { message: "Project updated.", status: "success" };
}

export async function createBuildingAction(
  _: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireMasterDataEditor();
  const input = createBuildingInputSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!input.success) return validationActionError(input.error);
  try {
    await createBuilding(actor.id, input.data);
  } catch (error) {
    if (isDuplicateMasterDataError(error))
      return {
        message: "This short code is already used in the project.",
        status: "error",
      };
    if (isExpectedMasterDataError(error))
      return { message: error.message, status: "error" };
    console.error("Unable to create building.", error);
    return unexpectedActionError("building");
  }
  revalidateProject(input.data.projectId);
  return { message: "Building added.", status: "success" };
}

export async function updateBuildingAction(
  _: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireMasterDataEditor();
  const projectId = formData.get("projectId");
  const input = updateBuildingInputSchema.safeParse({
    ...Object.fromEntries(formData),
    isActive: formData.has("isActive"),
  });
  if (!input.success) return validationActionError(input.error);
  try {
    await updateBuilding(actor.id, input.data);
  } catch (error) {
    if (isDuplicateMasterDataError(error))
      return {
        message: "This short code is already used in the project.",
        status: "error",
      };
    if (isExpectedMasterDataError(error))
      return { message: error.message, status: "error" };
    console.error("Unable to update building.", error);
    return unexpectedActionError("building");
  }
  if (typeof projectId === "string") revalidateProject(projectId);
  return { message: "Building updated.", status: "success" };
}
