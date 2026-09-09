"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { updateOrderBillingLinkAction } from "@/app/(app)/billing/actions";
import { AllocationInputs } from "@/components/billing/allocation-inputs";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import {
  ActionFeedback,
  Field,
  inputClassName,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import type { BillingActionState } from "@/domain/billing/action-state";
import { formatMoney } from "@/domain/procurement/presentation";

export interface SavedBillingAllocation {
  otherCoverageHt?: string;
  freightCoverageHt?: string;
  amount: string;
  orderId: string;
  isProjectRemainderApproved: boolean;
}

interface AllocationEditorProps {
  allocation?: {
    amount: string;
    orderId: string;
    otherCoverageHt?: string;
    freightCoverageHt?: string;
  };
  availableHt: string;
  billing: {
    id: string;
    reference: string;
    totalHt: string;
    currencyCode: string;
    isProjectRemainderApproved: boolean;
  };
  orders: {
    id: string;
    label: string;
    sellingBasisHt: string | null;
  }[];
  onSaved: (allocation: SavedBillingAllocation) => void;
}

const initialState: BillingActionState = { message: "", status: "idle" };

function AllocationForm({
  allocation,
  availableHt,
  billing,
  orders,
  onSaved,
}: AllocationEditorProps) {
  const [orderId, setOrderId] = useState(
    allocation?.orderId ?? (orders.length === 1 ? (orders[0]?.id ?? "") : ""),
  );
  const [otherCoverageHt, setOtherCoverageHt] = useState(
    allocation?.otherCoverageHt ?? "0",
  );
  const [freightCoverageHt, setFreightCoverageHt] = useState(
    allocation?.freightCoverageHt ?? "0",
  );
  const [amount, setAmount] = useState(allocation?.amount ?? "");
  const [approveRemainder, setApproveRemainder] = useState(
    billing.isProjectRemainderApproved,
  );
  const submitted = useRef<SavedBillingAllocation | null>(null);
  const { onSubmit, pending, state } = usePersistentActionState(
    updateOrderBillingLinkAction,
    initialState,
  );
  useEffect(() => {
    if (state.status !== "success" || !submitted.current) return;
    const saved = submitted.current;
    submitted.current = null;
    onSaved(saved);
  }, [state, onSaved]);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        submitted.current = {
          otherCoverageHt,
          freightCoverageHt: String(
            data.get("allocatedAmount.freightCoverageHt") ?? "0",
          ),
          orderId,
          amount: String(data.get("allocatedAmount") ?? ""),
          isProjectRemainderApproved: approveRemainder,
        };
        onSubmit(event);
      }}
    >
      <input type="hidden" name="billingDocumentId" value={billing.id} />
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="otherCoverageHt" value={otherCoverageHt} />
      <input type="hidden" name="freightCoverageHt" value={freightCoverageHt} />
      <input type="hidden" name="basis" value="FIXED_AMOUNT" />
      <input type="hidden" name="remove" value="false" />
      <fieldset disabled={pending} className="grid gap-4">
        <Field label="Order" error={state.fieldErrors?.orderId}>
          <select
            className={inputClassName}
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
            disabled={Boolean(allocation)}
            required
          >
            <option value="">Choose Order</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="bg-muted/30 grid gap-2 rounded-md border p-3 text-sm">
          <p>
            Billing HT: {formatMoney(billing.totalHt, billing.currencyCode)}
          </p>
          <p>
            Available for this Order:{" "}
            {formatMoney(availableHt, billing.currencyCode)}
          </p>
        </div>
        <AllocationInputs
          otherCoverageHt={otherCoverageHt}
          onOtherChange={setOtherCoverageHt}
          freightCoverageHt={freightCoverageHt}
          onFreightChange={setFreightCoverageHt}
          amount={amount}
          onAmountChange={setAmount}
          billingTotalHt={billing.totalHt}
          currencyCode={billing.currencyCode}
          orderSellHt={
            orders.find((order) => order.id === orderId)?.sellingBasisHt ?? null
          }
          error={state.fieldErrors?.allocatedAmount}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isProjectRemainderApproved"
            checked={approveRemainder}
            onChange={(event) => setApproveRemainder(event.target.checked)}
          />
          Approve any remaining Billing HT at Project level
        </label>
      </fieldset>
      <ActionFeedback state={state} />
      <SubmitButton pending={pending}>Save allocation</SubmitButton>
    </form>
  );
}

export function BillingAllocationEditor(props: AllocationEditorProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const title = props.allocation ? "Edit allocation" : "Add allocation";
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={props.orders.length === 0}
        aria-label={
          props.allocation
            ? `Edit allocation for ${props.orders.find((order) => order.id === props.allocation?.orderId)?.label ?? "Order"}`
            : title
        }
        onClick={() => setOpen(true)}
      >
        {title}
      </Button>
      {open ? (
        <EditorDrawer
          open={open}
          onOpenChange={setOpen}
          title={title}
          description={`Allocate ${props.billing.reference} HT to an Order in this Project.`}
        >
          <AllocationForm
            {...props}
            onSaved={(allocation) => {
              props.onSaved(allocation);
              setOpen(false);
              router.refresh();
            }}
          />
        </EditorDrawer>
      ) : null}
    </>
  );
}
