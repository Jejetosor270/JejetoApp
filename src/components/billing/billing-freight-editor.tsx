"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateBillingFreightCoverageAction } from "@/app/(app)/billing/actions";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import {
  ActionFeedback,
  Field,
  MoneyInput,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import type { BillingActionState } from "@/domain/billing/action-state";
import { formatMoney } from "@/domain/procurement/presentation";
type Props = {
  billingId: string;
  totalHt: string;
  currencyCode: string;
  freightCoverageHt: string;
  allocatedFreightHt: string;
  onSaved: (amount: string) => void;
};
const initial: BillingActionState = { status: "idle", message: "" };
function FreightForm(props: Props) {
  const [amount, setAmount] = useState(props.freightCoverageHt);
  const { state, onSubmit, pending } = usePersistentActionState(
    updateBillingFreightCoverageAction,
    initial,
  );
  useEffect(() => {
    if (state.status === "success" && state.values?.freightCoverageHt)
      props.onSaved(state.values.freightCoverageHt);
  }, [state, props]);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="billingDocumentId" value={props.billingId} />
      <p className="text-sm">
        Billing total HT: {formatMoney(props.totalHt, props.currencyCode)}
        <br />
        Freight already assigned to Orders:{" "}
        {formatMoney(props.allocatedFreightHt, props.currencyCode)}
      </p>
      <fieldset disabled={pending}>
        <Field
          label={`Total freight coverage HT (${props.currencyCode})`}
          error={state.fieldErrors?.freightCoverageHt}
        >
          <MoneyInput
            name="freightCoverageHt"
            value={amount}
            onValueChange={setAmount}
            required
          />
        </Field>
      </fieldset>
      <p className="text-muted-foreground text-sm">
        Enter the part of this billing event that covers freight. This is
        included in Billing HT. Freight not assigned to Orders stays at Project
        level. Existing Order allocations stay unchanged; edit their freight
        portions separately if needed.
      </p>
      <ActionFeedback state={state} />
      <SubmitButton pending={pending}>Save freight coverage</SubmitButton>
    </form>
  );
}
export function BillingFreightEditor(props: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const title =
    props.freightCoverageHt === "0" ||
    /^0(?:\.0+)?$/.test(props.freightCoverageHt)
      ? "Allocate freight"
      : "Edit freight coverage";
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        {title}
      </Button>
      {open && (
        <EditorDrawer
          open={open}
          onOpenChange={setOpen}
          title={title}
          description="Allocate freight within this billing event, including Project-level coverage."
        >
          <FreightForm
            {...props}
            onSaved={(amount) => {
              props.onSaved(amount);
              setOpen(false);
              router.refresh();
            }}
          />
        </EditorDrawer>
      )}
    </>
  );
}
