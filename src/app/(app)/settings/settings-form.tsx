"use client";

import { useActionState } from "react";

import { updateApplicationSettingsAction } from "@/app/(app)/settings/actions";
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
