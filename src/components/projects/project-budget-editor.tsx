"use client";
import { useEffect, useState, type ReactNode } from "react";
import Decimal from "decimal.js";
import type { ProjectView } from "@/app/(app)/projects/[projectId]/project-detail";
import { updateProjectBudgetAction } from "@/app/(app)/projects/[projectId]/actions";
import { FormSection } from "@/components/forms/form-section";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import {
  initialMasterDataActionState,
  type MasterDataActionState,
} from "@/components/master-data/action-state";
import {
  ActionFeedback,
  Field,
  inputClassName,
  MoneyInput,
  PercentageInput,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { ProjectBudgetContext as BudgetContext } from "./project-budget-context";
export function ProjectBudgetFields({
  project,
  fieldErrors,
}: {
  project: ProjectView;
  fieldErrors?: MasterDataActionState["fieldErrors"];
}) {
  const [targetMode, setTargetMode] = useState(project.targetMode);
  return (
    <>
      {" "}
      <FormSection
        title="Planning / Budget"
        description="Amounts are HT in the Project reporting currency. Freight allowance applies to expected Product Purchase Cost HT."
      >
        <Field
          error={fieldErrors?.clientBudgetTargetHt}
          label="Client Budget Target HT"
        >
          <MoneyInput
            className={inputClassName}
            defaultValue={project.clientBudgetTargetHt?.toString() ?? ""}
            name="clientBudgetTargetHt"
          />
        </Field>
        <Field
          error={fieldErrors?.estimatedPurchaseCostHt}
          label="Estimated Purchase Cost HT"
        >
          <MoneyInput
            className={inputClassName}
            defaultValue={project.estimatedPurchaseCostHt?.toString() ?? ""}
            name="estimatedPurchaseCostHt"
          />
        </Field>
        <Field
          error={fieldErrors?.estimatedOtherCostHt}
          label="Other/services budget HT"
        >
          <MoneyInput
            className={inputClassName}
            defaultValue={project.estimatedOtherCostHt?.toString() ?? ""}
            name="estimatedOtherCostHt"
          />
          <p className="text-muted-foreground text-xs">
            Enter 0 to approve a zero budget; blank means not budgeted.
          </p>
        </Field>
        <Field label="Budgeted freight HT (automatic)">
          <p className="text-muted-foreground text-sm">
            Calculated from expected Product Purchase Cost HT × Project freight
            %.
          </p>
        </Field>
        <Field
          error={fieldErrors?.freightEstimateRate}
          label="Expected freight allowance %"
        >
          <PercentageInput
            className={inputClassName}
            defaultValue={
              project.freightEstimateRate
                ? new Decimal(project.freightEstimateRate.toString())
                    .times(100)
                    .toString()
                : ""
            }
            name="freightEstimateRate"
          />
        </Field>
      </FormSection>
      <FormSection title="Default Pricing">
        <Field
          error={fieldErrors?.defaultProductMarkupRate}
          label="Default Product Markup %"
        >
          <PercentageInput
            className={inputClassName}
            defaultValue={new Decimal(
              project.defaultProductMarkupRate.toString(),
            )
              .times(100)
              .toString()}
            name="defaultProductMarkupRate"
          />
        </Field>
        <Field
          error={fieldErrors?.defaultFreightMarkupRate}
          label="Default Freight Markup %"
        >
          <PercentageInput
            className={inputClassName}
            defaultValue={new Decimal(
              project.defaultFreightMarkupRate.toString(),
            )
              .times(100)
              .toString()}
            name="defaultFreightMarkupRate"
          />
        </Field>
        <Field
          error={fieldErrors?.defaultOtherCostMarkupRate}
          label="Default Other Cost Markup %"
        >
          <PercentageInput
            className={inputClassName}
            defaultValue={new Decimal(
              project.defaultOtherCostMarkupRate.toString(),
            )
              .times(100)
              .toString()}
            name="defaultOtherCostMarkupRate"
          />
        </Field>
      </FormSection>
      <FormSection title="Project selling target">
        <Field label="Target mode">
          <select
            className={inputClassName}
            name="targetMode"
            value={targetMode}
            onChange={(event) =>
              setTargetMode(event.target.value as ProjectView["targetMode"])
            }
          >
            <option value="MARKUP">Category markup</option>
            <option value="EXPECTED_SELL">Approved selling target</option>
          </select>
        </Field>
        <div hidden={targetMode !== "EXPECTED_SELL"}>
          <Field
            label="Approved selling target HT"
            error={fieldErrors?.expectedSellHt}
          >
            <MoneyInput
              disabled={targetMode !== "EXPECTED_SELL"}
              name="expectedSellHt"
              defaultValue={project.expectedSellHt?.toString() ?? ""}
            />
          </Field>
        </div>
      </FormSection>
      <FormSection title="Freight">
        <div className="@min-[28rem]:col-span-2">
          <Field
            error={fieldErrors?.freightEstimateNotes}
            label="Expected freight allowance notes"
          >
            <input
              className={inputClassName}
              defaultValue={project.freightEstimateNotes ?? ""}
              name="freightEstimateNotes"
            />
          </Field>
        </div>
      </FormSection>
    </>
  );
}
function BudgetForm({
  project: latestProject,
  onClose,
}: {
  project: ProjectView;
  onClose: () => void;
}) {
  // A refresh must not bless an old DOM draft with a newer concurrency token.
  const [project] = useState(latestProject);
  const { state, onSubmit, pending } = usePersistentActionState(
    updateProjectBudgetAction,
    initialMasterDataActionState,
  );
  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state.status, onClose]);
  return (
    <form onSubmit={onSubmit} className="@container space-y-7">
      <input type="hidden" name="id" value={project.id} />
      <input
        type="hidden"
        name="expectedVersion"
        value={project.budgetEditVersion}
      />
      <input
        type="hidden"
        name="expectedFields"
        value={project.budgetEditFields}
      />
      <p className="text-muted-foreground text-sm">
        Amounts in {project.reportingCurrencyCode}, excluding VAT. Changing
        default markup also changes Orders using Project pricing; existing
        payment terms stay unchanged.
      </p>
      <ProjectBudgetFields project={project} fieldErrors={state.fieldErrors} />
      <div className="flex flex-wrap items-center gap-3 border-t pt-5">
        <SubmitButton pending={pending}>Save budget & pricing</SubmitButton>
        <ActionFeedback state={state} />
      </div>
    </form>
  );
}
export function ProjectBudgetProvider({
  project,
  canEdit,
  children,
}: {
  project: ProjectView;
  canEdit: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <BudgetContext.Provider value={canEdit ? () => setOpen(true) : null}>
      {children}
      {canEdit && open && (
        <EditorDrawer open title="Edit budget & pricing" onOpenChange={setOpen}>
          <BudgetForm project={project} onClose={() => setOpen(false)} />
        </EditorDrawer>
      )}
    </BudgetContext.Provider>
  );
}
