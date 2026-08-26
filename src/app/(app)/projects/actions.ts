"use server";

import { revalidatePath } from "next/cache";

import type { MasterDataActionState } from "@/components/master-data/action-state";
import type { BulkActionState } from "@/domain/deletion/action-state";
import { selectedIds, selectedIdsSchema } from "@/domain/deletion/validation";
import { createProjectInputSchema } from "@/domain/master-data/validation";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { archiveProjects, BulkDeletionError } from "@/lib/deletion/bulk";
import {
  unexpectedActionError,
  validationActionError,
} from "@/lib/master-data/action-helpers";
import {
  isDuplicateMasterDataError,
  isExpectedMasterDataError,
} from "@/lib/master-data/errors";
import { createProject } from "@/lib/master-data/projects";

export async function createProjectAction(
  _: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireMasterDataEditor();
  const input = createProjectInputSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!input.success) return validationActionError(input.error);
  try {
    await createProject(actor.id, input.data);
  } catch (error) {
    if (isDuplicateMasterDataError(error))
      return { message: "A project already uses this code.", status: "error" };
    if (isExpectedMasterDataError(error))
      return { message: error.message, status: "error" };
    console.error("Unable to create project.", error);
    return unexpectedActionError("project");
  }
  revalidatePath("/projects");
  return { message: "Project created.", status: "success" };
}

export async function archiveSelectedProjectsAction(
  formData: FormData,
): Promise<BulkActionState> {
  const actor = await requireMasterDataEditor();
  const input = selectedIdsSchema.safeParse(selectedIds(formData));
  if (!input.success) {
    return {
      message: input.error.issues[0]?.message ?? "Check the selected Projects.",
      status: "error",
    };
  }
  try {
    await archiveProjects(actor.id, input.data);
  } catch (error) {
    if (error instanceof BulkDeletionError) {
      return { message: error.message, status: "error" };
    }
    console.error("Unable to archive selected Projects.", error);
    return {
      message: "The selected Projects could not be archived.",
      status: "error",
    };
  }
  revalidatePath("/projects");
  revalidatePath("/orders");
  revalidatePath("/reports");
  return {
    message: `${input.data.length} Project${input.data.length === 1 ? "" : "s"} archived.`,
    status: "success",
  };
}
