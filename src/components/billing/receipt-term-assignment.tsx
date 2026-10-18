"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateClientReceiptAction } from "@/app/(app)/billing/actions";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import { Field, inputClassName } from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import type { BillingActionState } from "@/domain/billing/action-state";
import { receiptTermChoices } from "@/domain/billing/term-presentation";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import type { ClientBillingView } from "@/lib/billing/billing";

type AssignmentSnapshot = {
  receipt: ClientBillingView["receipts"][number];
  terms: ClientBillingView["paymentInstallments"];
};

export function ReceiptTermAssignment({
  receipt,
  terms,
  currencyCode,
}: AssignmentSnapshot & { currencyCode: string }) {
  const [snapshot, setSnapshot] = useState<AssignmentSnapshot | null>(null);
  const router = useRouter();
  const saved = useCallback(() => {
    setSnapshot(null);
    router.refresh();
  }, [router]);
  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={() => setSnapshot({ receipt, terms })}
      >
        Assign to term
      </Button>
      {snapshot && (
        <EditorDrawer
          open
          title="Assign receipt"
          onOpenChange={(open) => {
            if (!open) setSnapshot(null);
          }}
        >
          <AssignmentForm
            snapshot={snapshot}
            currencyCode={currencyCode}
            onSaved={saved}
          />
        </EditorDrawer>
      )}
    </>
  );
}

function AssignmentForm({
  snapshot,
  currencyCode,
  onSaved,
}: {
  snapshot: AssignmentSnapshot;
  currencyCode: string;
  onSaved: () => void;
}) {
  const { receipt, terms } = snapshot;
  const [termId, setTermId] = useState("");
  const { onSubmit, pending, state } =
    usePersistentActionState<BillingActionState>(updateClientReceiptAction, {
      status: "idle",
      message: "",
    });
  useEffect(() => {
    if (state.status === "success") onSaved();
  }, [state, onSaved]);
  const choices = receiptTermChoices(receipt, currencyCode, terms);
  const values = {
    id: receipt.id,
    billingDocumentId: receipt.billingDocumentId,
    expectedVersion: receipt.editVersion ?? "",
    amount: receipt.amount,
    receivedAt: receipt.receivedAt,
    fxRate: receipt.fxRate ?? "",
    reference: receipt.reference ?? "",
    notes: receipt.notes ?? "",
  };
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm tabular-nums">
        {receipt.reference || "Receipt"} · {formatDateOnly(receipt.receivedAt)}{" "}
        · {formatMoney(receipt.amount, currencyCode)}
      </p>
      <p className="text-muted-foreground text-sm">
        Assign this existing receipt to one term. Its amount, date and FX stay
        unchanged; no new cash is recorded.
      </p>
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value ?? ""} />
      ))}
      <Field
        label="Payment term"
        error={state.fieldErrors?.installmentId}
        required
      >
        <select
          name="installmentId"
          className={inputClassName}
          required
          value={termId}
          onChange={(event) => setTermId(event.target.value)}
        >
          <option value="">Choose term</option>
          {choices.map(({ term, available, fits }) => (
            <option key={term.id} value={term.id} disabled={!fits}>
              {term.label} · {formatMoney(available, currencyCode)} available
              {!fits ? " · Receipt exceeds term" : ""}
            </option>
          ))}
        </select>
      </Field>
      {!choices.some((choice) => choice.fits) && (
        <p className="text-muted-foreground text-sm">
          No term can hold this receipt. Review the terms first; the receipt
          remains at invoice level.
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending || !termId}>
        {pending ? "Saving…" : "Assign receipt"}
      </Button>
    </form>
  );
}
