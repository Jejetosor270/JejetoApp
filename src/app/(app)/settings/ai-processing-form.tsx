"use client";

import { useState } from "react";
import {
  AI_PROCESSING_CAPABILITIES,
  AI_PROCESSING_MODELS,
  type AiProcessingModels,
} from "@/config/ai-processing";
import { updateAiProcessingSettingsAction } from "./actions";
import { initialMasterDataActionState } from "@/components/master-data/action-state";
import {
  ActionFeedback,
  Field,
  inputClassName,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";

export function AiProcessingForm({ models }: { models: AiProcessingModels }) {
  const [draft, setDraft] = useState(models);
  const { onSubmit, pending, state } = usePersistentActionState(
    updateAiProcessingSettingsAction,
    initialMasterDataActionState,
  );
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <fieldset disabled={pending} className="grid gap-5 lg:grid-cols-3">
        {AI_PROCESSING_CAPABILITIES.map(({ field, label, description }) => (
          <div key={field} className="space-y-2">
            <Field label={label} error={state.fieldErrors?.[field]}>
              <select
                name={field}
                className={inputClassName}
                value={draft[field]}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
                required
              >
                {!AI_PROCESSING_MODELS.some(
                  (model) => model.id === draft[field],
                ) ? (
                  <option value={draft[field]} disabled>
                    Current: {draft[field]}
                  </option>
                ) : null}
                {AI_PROCESSING_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-muted-foreground text-xs leading-5">
              {description}
            </p>
          </div>
        ))}
      </fieldset>
      <p className="text-muted-foreground text-sm">
        Saved choices apply to new analyses for all employees. Analyses already
        running and previously imported records are unchanged.
      </p>
      <ActionFeedback state={state} />
      <SubmitButton pending={pending}>Save AI models</SubmitButton>
    </form>
  );
}
