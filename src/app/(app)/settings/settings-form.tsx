"use client";

import { useActionState } from "react";

import {
  updateApplicationSettingsAction,
  updateItemManagementSettingAction,
} from "@/app/(app)/settings/actions";
import { initialMasterDataActionState } from "@/components/master-data/action-state";
import { ActionFeedback, SubmitButton } from "@/components/master-data/form-ui";

export function SettingsForm({ companyName }: { companyName: string }) {
  const [state, action, pending] = useActionState(
    updateApplicationSettingsAction,
    initialMasterDataActionState,
  );
  return (
    <form action={action} className="space-y-4">
      <label className="grid max-w-xl gap-1.5 text-sm font-medium">
        Company display name
        <input
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={companyName}
          maxLength={160}
          name="companyName"
          required
        />
      </label>
      <div className="flex items-center gap-3">
        <SubmitButton pending={pending}>Save settings</SubmitButton>
        <ActionFeedback state={state} />
      </div>
    </form>
  );
}

export function ItemManagementSettingForm({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(
    updateItemManagementSettingAction,
    initialMasterDataActionState,
  );
  return (
    <form action={action} className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          className="accent-primary size-4"
          defaultChecked={enabled}
          name="itemManagementEnabled"
          type="checkbox"
        />
        Enable Item Management (Beta)
      </label>
      <p className="text-muted-foreground text-xs">
        Disabling hides Item workflows but never deletes or changes Item data.
      </p>
      <div className="flex items-center gap-3">
        <SubmitButton pending={pending}>Save Beta setting</SubmitButton>
        <ActionFeedback state={state} />
      </div>
    </form>
  );
}
