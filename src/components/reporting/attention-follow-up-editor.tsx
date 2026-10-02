"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAttentionFollowUp } from "@/app/(app)/attention-actions";
import type { AttentionHorizon } from "@/domain/finance/attention";
import type { AttentionFollowUp } from "@/domain/finance/attention-follow-up";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { DateInput } from "@/components/forms/date-input";
import { Field, inputClassName } from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";

export function AttentionFollowUpEditor({
  row,
  horizon,
  employees,
  onClose,
}: {
  row: {
    key: string;
    title: string;
    reference: string;
    followUp?: AttentionFollowUp | null;
  };
  horizon: AttentionHorizon;
  employees: readonly { id: string; name: string }[];
  onClose: () => void;
}) {
  // Capture the original version with the draft, never refresh it under an open editor.
  const [version] = useState(row.followUp?.version ?? null);
  const [assigneeId, setAssigneeId] = useState(row.followUp?.assigneeId ?? "");
  const [date, setDate] = useState(row.followUp?.nextFollowUpDate ?? "");
  const [note, setNote] = useState(row.followUp?.note ?? "");
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <EditorDrawer
      open
      size="compact"
      title="Shared follow-up"
      description="Visible to your team. This date is a next action, not a payment due date. Financial issues clear only when their source records are corrected."
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            try {
              const result = await updateAttentionFollowUp({
                key: row.key,
                horizon,
                version,
                assigneeId: assigneeId || null,
                nextFollowUpDate: date || null,
                note,
              });
              setFeedback(result.message);
              if (result.ok) {
                onClose();
                router.refresh();
              }
            } catch {
              setFeedback(
                "Could not save the follow-up. Your draft is retained; please try again.",
              );
            }
          });
        }}
      >
        <p className="text-sm font-medium">
          {row.title} · {row.reference}
        </p>
        <Field label="Owner">
          <select
            name="assigneeId"
            className={inputClassName}
            value={assigneeId}
            disabled={pending}
            onChange={(event) => setAssigneeId(event.target.value)}
          >
            <option value="">Unassigned</option>
            {assigneeId &&
              !employees.some((employee) => employee.id === assigneeId) && (
                <option value={assigneeId} disabled>
                  {row.followUp?.assigneeName ?? "Previous owner"} (inactive)
                </option>
              )}
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Next follow-up date">
          <DateInput
            name="nextFollowUpDate"
            value={date}
            disabled={pending}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <Field label="Note">
          <textarea
            name="followUpNote"
            className={inputClassName}
            value={note}
            maxLength={1000}
            disabled={pending}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        {feedback && (
          <p role="alert" className="text-sm">
            {feedback}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save follow-up"}
        </Button>
      </form>
    </EditorDrawer>
  );
}
