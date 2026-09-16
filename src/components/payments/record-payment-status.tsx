"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRecordStatusAction } from "@/app/(app)/payments/record-status-actions";
import { recordPaymentStatusLabel } from "@/domain/payments/record-status";
import { businessToday } from "@/domain/payments/dates";
import { DateInput } from "@/components/forms/date-input";
import {
  Field,
  MoneyInput,
  inputClassName,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import { EditorDrawer } from "@/components/forms/editor-drawer";

export function RecordPaymentStatus({
  kind,
  id,
  automatic,
  override,
  cancelled,
  canEdit,
  showCancel = false,
  onCancelled,
}: {
  kind: "order" | "billing";
  id: string;
  automatic: string;
  override?: string | null | undefined;
  cancelled: boolean;
  canEdit: boolean;
  showCancel?: boolean;
  onCancelled?: () => void;
}) {
  const [paymentMode, setPaymentMode] = useState<
    "PAID" | "PARTIALLY_PAID" | null
  >(null);
  const [amount, setAmount] = useState("");
  const [paymentFx, setPaymentFx] = useState("");
  const [paymentDate, setPaymentDate] = useState(businessToday());
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const save = (value: string) =>
    startTransition(async () => {
      try {
        const result = await saveRecordStatusAction({
          kind,
          id,
          value,
          paymentDate,
          paymentFx,
          ...(value === "PARTIALLY_PAID" ? { amount } : {}),
        });
        setFeedback(result.message ?? "");
        if (result.status === "success") {
          if (value === "CANCEL") {
            setConfirming(false);
            onCancelled?.();
          } else setPaymentMode(null);
          router.refresh();
        } else if (value === "PAID") {
          setPaymentMode("PAID");
        }
      } catch {
        setFeedback("Status could not be saved. Your selection is retained.");
      }
    });
  return (
    <div className="space-y-2 text-xs">
      {canEdit && !cancelled ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            Payment status
            <select
              className="border-input bg-background rounded-md border px-2 py-1.5"
              value="AUTO"
              disabled={pending}
              onChange={(event) => {
                setFeedback("");
                if (event.target.value === "PAID") save("PAID");
                else if (event.target.value === "PARTIALLY_PAID")
                  setPaymentMode("PARTIALLY_PAID");
              }}
            >
              <option value="AUTO">
                Automatic · {recordPaymentStatusLabel(automatic)}
              </option>
              <option value="PAID">Paid · record remaining payment</option>
              <option value="PARTIALLY_PAID">
                Partially paid · record amount
              </option>
            </select>
          </label>
          {automatic !== "PAID" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => save("PAID")}
            >
              Mark as paid
            </Button>
          )}
          {showCancel && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setFeedback("");
                setConfirming(true);
              }}
            >
              Cancel {kind === "order" ? "Order" : "Billing"}
            </Button>
          )}
        </div>
      ) : (
        <span>{recordPaymentStatusLabel(automatic, override, cancelled)}</span>
      )}
      {paymentMode && (
        <EditorDrawer
          open
          title={
            paymentMode === "PAID"
              ? "Complete payment"
              : "Record partial payment"
          }
          onOpenChange={(open) => {
            if (!open && !pending) setPaymentMode(null);
          }}
        >
          <div className="space-y-4">
            {paymentMode === "PARTIALLY_PAID" && (
              <Field label="Actual amount TTC">
                <MoneyInput
                  name="amount"
                  value={amount}
                  onValueChange={setAmount}
                />
              </Field>
            )}
            <Field label="Payment date">
              <DateInput
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </Field>
            <Field label="Actual FX (foreign currency)">
              <input
                className={inputClassName}
                value={paymentFx}
                onChange={(e) => setPaymentFx(e.target.value)}
              />
            </Field>
            {feedback && <p role="alert">{feedback}</p>}
            <Button disabled={pending} onClick={() => save(paymentMode)}>
              Record payment
            </Button>
          </div>
        </EditorDrawer>
      )}
      {feedback && !confirming && <p role="status">{feedback}</p>}
      {confirming && (
        <EditorDrawer
          open
          title={`Cancel ${kind === "order" ? "Order" : "Billing"}`}
          onOpenChange={(open) => {
            if (!pending) setConfirming(open);
          }}
        >
          <p className="text-sm">
            Cancel this record? Commercial reporting and forecasts will update.
            Existing records and cash history are retained.
          </p>
          {feedback && (
            <p role="alert" className="mt-3 text-sm">
              {feedback}
            </p>
          )}
          <Button
            type="button"
            className="mt-4"
            disabled={pending}
            onClick={() => save("CANCEL")}
          >
            Confirm cancellation
          </Button>
        </EditorDrawer>
      )}
    </div>
  );
}
