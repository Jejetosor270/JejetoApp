"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRecordStatusAction } from "@/app/(app)/payments/record-status-actions";
import {
  manualPaymentStatuses,
  recordPaymentStatusLabel,
} from "@/domain/payments/record-status";
import { formatEnumLabel } from "@/domain/presentation/labels";
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
  const [draft, setDraft] = useState(override ?? "AUTO");
  const [saved, setSaved] = useState(override ?? "AUTO");
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const save = (value: string) =>
    startTransition(async () => {
      try {
        const result = await saveRecordStatusAction({ kind, id, value });
        setFeedback(result.message ?? "");
        if (result.status === "success") {
          if (value === "CANCEL") {
            setConfirming(false);
            onCancelled?.();
          } else setSaved(value);
          router.refresh();
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
              value={draft}
              disabled={pending}
              onChange={(event) => setDraft(event.target.value)}
            >
              <option value="AUTO">
                Automatic · {recordPaymentStatusLabel(automatic)}
              </option>
              {manualPaymentStatuses.map((status) => (
                <option key={status} value={status}>
                  {formatEnumLabel(status)} (manual)
                </option>
              ))}
            </select>
          </label>
          {draft !== saved && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => save(draft)}
            >
              Save status
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
      {saved !== "AUTO" && !cancelled && (
        <p className="text-muted-foreground">
          Automatic: {recordPaymentStatusLabel(automatic)}. Manual status does
          not change cash or balances.
        </p>
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
