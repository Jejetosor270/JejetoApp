"use server";

import { revalidatePath } from "next/cache";

import type { MasterDataActionState } from "@/components/master-data/action-state";
import { applicationSettingsSchema } from "@/domain/settings/validation";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { updateApplicationSettings } from "@/lib/settings/application-settings";

export async function updateApplicationSettingsAction(
  _: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireMasterDataEditor();
  const input = applicationSettingsSchema.safeParse({
    companyName: formData.get("companyName"),
  });
  if (!input.success) {
    return {
      message: input.error.issues[0]?.message ?? "Check the company settings.",
      status: "error",
    };
  }
  try {
    await updateApplicationSettings(actor.id, input.data);
    revalidatePath("/settings");
    revalidatePath("/");
    return { message: "Application settings updated.", status: "success" };
  } catch (error) {
    console.error("Unable to update application settings.", error);
    return {
      message: "The application settings could not be updated.",
      status: "error",
    };
  }
}
