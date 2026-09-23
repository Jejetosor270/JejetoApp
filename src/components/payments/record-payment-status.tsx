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
  const [open, setOpen] = useState(false);
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
          } else {
            setPaymentMode(null);
            setOpen(false);
          }
          router.refresh();
        } else if (value === "PAID") {
          setPaymentMode("PAID");
          setOpen(true);
        }
      } catch {
        setFeedback("Status could not be saved. Your selection is retained.");
      }
    });
  return (
    <div className="space-y-2 text-xs">
      {canEdit && !cancelled ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Change payment status"
            disabled={pending}
            onClick={() => {
              setFeedback("");
              setOpen(true);
            }}
          >
            {recordPaymentStatusLabel(automatic)}
          </Button>
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
      {open && (
        <EditorDrawer
          open
          size="compact"
          title="Purchasing payment status"
          onOpenChange={(open) => {
            if (!pending) setOpen(open);
          }}
        >
          <div className="space-y-4">
            <Field label="Payment status">
              <select
                name="status"
                aria-label="Payment status"
                className={inputClassName}
                value={paymentMode ?? "AUTO"}
                disabled={pending}
                onChange={(event) => {
                  setFeedback("");
                  const value = event.target.value;
                  if (value === "PAID") {
                    setPaymentMode("PAID");
                    save("PAID");
                  } else
                    setPaymentMode(value === "PARTIALLY_PAID" ? value : null);
                }}
              >
                <option value="AUTO">
                  {recordPaymentStatusLabel(automatic)} · automatic
                </option>
                {automatic !== "PAID" && <option value="PAID">Paid</option>}
                {automatic !== "PAID" && (
                  <option value="PARTIALLY_PAID">Partially paid</option>
                )}
              </select>
            </Field>
            {!paymentMode && (
              <p className="text-muted-foreground text-sm">
                Payment status follows recorded payments and due dates. Marking
                as paid records the remaining payment.
              </p>
            )}
            {paymentMode === "PARTIALLY_PAID" && (
              <Field label="Actual amount TTC">
                <MoneyInput
                  name="amount"
                  value={amount}
                  onValueChange={setAmount}
                />
              </Field>
            )}
            {paymentMode && (
              <>
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
              </>
            )}
            {feedback && <p role="alert">{feedback}</p>}
            {paymentMode && (
              <Button disabled={pending} onClick={() => save(paymentMode)}>
                Record payment
              </Button>
            )}
          </div>
        </EditorDrawer>
      )}
      {feedback && !confirming && !open && <p role="status">{feedback}</p>}
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
