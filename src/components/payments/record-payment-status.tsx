"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRecordStatusAction } from "@/app/(app)/payments/record-status-actions";
import { recordPaymentStatusLabel } from "@/domain/payments/record-status";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { recordStatusTone } from "@/components/ui/record-status-tone";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { OrderTermPaymentDrawer } from "./order-term-payment-drawer";

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
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const cancel = () =>
    startTransition(async () => {
      try {
        const result = await saveRecordStatusAction({
          kind,
          id,
          value: "CANCEL",
        });
        setFeedback(result.message ?? "");
        if (result.status === "success") {
          setConfirming(false);
          onCancelled?.();
          router.refresh();
        }
      } catch {
        setFeedback("Cancellation could not be saved. Please try again.");
      }
    });
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={recordStatusTone(cancelled ? "CANCELLED" : automatic)}>
          {recordPaymentStatusLabel(automatic, override, cancelled)}
        </Badge>
        {canEdit && !cancelled && (
          <>
            {kind === "order" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setFeedback("");
                  setOpen(true);
                }}
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
          </>
        )}
      </div>
      {open && kind === "order" && canEdit && !cancelled && (
        <OrderTermPaymentDrawer
          orderId={id}
          open={open}
          onOpenChange={setOpen}
        />
      )}
      {feedback && !confirming && !open && <p role="status">{feedback}</p>}
      {confirming && canEdit && !cancelled && (
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
            onClick={cancel}
          >
            Confirm cancellation
          </Button>
        </EditorDrawer>
      )}
    </div>
  );
}
