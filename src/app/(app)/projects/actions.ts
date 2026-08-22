"use server";

import { revalidatePath } from "next/cache";

import type { MasterDataActionState } from "@/components/master-data/action-state";
import { createProjectInputSchema } from "@/domain/master-data/validation";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
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
