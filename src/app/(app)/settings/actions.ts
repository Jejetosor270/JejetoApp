"use server";

import { revalidatePath } from "next/cache";

import type { MasterDataActionState } from "@/components/master-data/action-state";
import { applicationSettingsSchema } from "@/domain/settings/validation";
import { aiProcessingSettingsSchema } from "@/domain/settings/ai-processing";
import { updateAiProcessingSettings } from "@/lib/settings/ai-processing-settings";
import { requireAdmin, requireMasterDataEditor } from "@/lib/auth/current-user";
import {
  updateApplicationSettings,
  updateItemManagementSetting,
} from "@/lib/settings/application-settings";

export async function updateAiProcessingSettingsAction(
  _: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireMasterDataEditor();
  const input = aiProcessingSettingsSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!input.success) {
    return {
      status: "error",
      formError: "Choose a supported model for each AI processing capability.",
      fieldErrors: Object.fromEntries(
        input.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ]),
      ),
    };
  }
  try {
    await updateAiProcessingSettings(actor.id, input.data);
    revalidatePath("/settings");
    return {
      status: "success",
      message: "AI models saved. New analyses will use these choices.",
    };
  } catch (error) {
    console.error("Unable to update AI processing settings.", error);
    return {
      status: "error",
      formError:
        "The AI models could not be saved. Your choices have been kept.",
    };
  }
}

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

export async function updateItemManagementSettingAction(
  _: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  const actor = await requireAdmin();
  const enabled = formData.get("itemManagementEnabled") === "on";
  try {
    await updateItemManagementSetting(actor.id, enabled);
    revalidatePath("/", "layout");
    return {
      message: `Item Management (Beta) ${enabled ? "enabled" : "disabled"}. Existing Item data was preserved.`,
      status: "success",
    };
  } catch (error) {
    console.error("Unable to update Item Management setting.", error);
    return {
      message: "The Item Management setting could not be updated.",
      status: "error",
    };
  }
}
