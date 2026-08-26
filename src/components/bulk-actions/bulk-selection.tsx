"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { BulkActionState } from "@/domain/deletion/action-state";

export type BulkServerAction = (formData: FormData) => Promise<BulkActionState>;

export function useBulkSelection(rowIds: string[]) {
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const selectedIds = rowIds.filter((id) => selection.has(id));
  const allSelected = rowIds.length > 0 && selectedIds.length === rowIds.length;
  return {
    allSelected,
    clear: () => setSelection(new Set()),
    isSelected: (id: string) => selection.has(id),
    selectedIds,
    toggle: (id: string) =>
      setSelection((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    toggleAll: () => setSelection(allSelected ? new Set() : new Set(rowIds)),
  };
}

export function BulkActionBar({
  action,
  actionLabel,
  clearSelection,
  confirmationVerb,
  selectedIds,
}: {
  action: BulkServerAction;
  actionLabel: string;
  clearSelection: () => void;
  confirmationVerb: string;
  selectedIds: string[];
}) {
  const [feedback, setFeedback] = useState<BulkActionState | null>(null);
  const [pending, startTransition] = useTransition();
  const count = selectedIds.length;
  const runAction = () => {
    if (
      !window.confirm(
        `${confirmationVerb} ${count} selected record${count === 1 ? "" : "s"}?`,
      )
    ) {
      return;
    }
    const formData = new FormData();
    selectedIds.forEach((id) => formData.append("selectedIds", id));
    startTransition(async () => {
      try {
        const result = await action(formData);
        setFeedback(result);
        if (result.status === "success") clearSelection();
      } catch {
        setFeedback({
          message: "The bulk action could not be completed. Please try again.",
          status: "error",
        });
      }
    });
  };
  if (count === 0 && !feedback) return null;
  return (
    <div className="bg-muted/30 flex flex-wrap items-center gap-3 border-b px-4 py-2">
      {count > 0 ? (
        <>
          <span className="text-sm font-medium">{count} selected</span>
          <Button
            disabled={pending}
            onClick={runAction}
            size="sm"
            type="button"
            variant="destructive"
          >
            <Trash2 data-icon="inline-start" />
            {pending ? "Working…" : actionLabel}
          </Button>
        </>
      ) : null}
      {feedback ? (
        <p
          className={
            feedback.status === "error"
              ? "text-destructive text-xs"
              : "text-positive text-xs"
          }
          role={feedback.status === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}

export function SelectionHeader({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <th className="w-10 px-3 py-3">
      <input
        aria-label="Select all visible rows"
        checked={checked}
        className="accent-primary size-4"
        disabled={disabled}
        onChange={onChange}
        type="checkbox"
      />
    </th>
  );
}

export function SelectionCell({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <td className="w-10 px-3 py-3">
      <input
        aria-label={`Select ${label}`}
        checked={checked}
        className="accent-primary size-4"
        onChange={onChange}
        type="checkbox"
      />
    </td>
  );
}
