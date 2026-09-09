"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { BulkActionState } from "@/domain/deletion/action-state";

export type BulkServerAction = (formData: FormData) => Promise<BulkActionState>;

export function useBulkSelection(rowIds: string[]) {
  const search = useSearchParams();
  const scope = `${search.toString()}:${rowIds.join(",")}`;
  const [previousScope, setPreviousScope] = useState(scope);
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  if (scope !== previousScope) {
    setPreviousScope(scope);
    setSelection(new Set());
  }
  const selectedIds = rowIds.filter((id) => selection.has(id));
  const allSelected = rowIds.length > 0 && selectedIds.length === rowIds.length;
  return {
    allSelected,
    someSelected: selectedIds.length > 0 && !allSelected,
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
  clearSelection,
  entityName,
  impactSummary,
  permanent = false,
  unlink = false,
  scope,
  selectedIds,
}: {
  action: BulkServerAction;
  clearSelection: () => void;
  entityName: string;
  impactSummary?: string;
  permanent?: boolean;
  unlink?: boolean;
  scope: string;
  selectedIds: string[];
}) {
  const [feedback, setFeedback] = useState<BulkActionState | null>(null);
  const [pending, startTransition] = useTransition();
  const count = selectedIds.length;
  const runAction = () => {
    const formData = new FormData();
    selectedIds.forEach((id) => formData.append("selectedIds", id));
    setFeedback(null);
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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={pending}
                size="sm"
                type="button"
                variant="destructive"
              >
                <Trash2 data-icon="inline-start" />
                {pending
                  ? "Working…"
                  : unlink
                    ? "Remove selected links"
                    : "Delete selected"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {unlink
                    ? "Remove links to"
                    : permanent
                      ? "Permanently delete"
                      : "Move to Trash"}{" "}
                  {count === 1 ? "this" : count}{" "}
                  {count === 1 ? entityName : `selected ${entityName}s`}?
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p>{scope}</p>
                    {impactSummary ? (
                      <p className="text-foreground font-medium">
                        {impactSummary}
                      </p>
                    ) : null}
                    <p className="text-destructive font-medium">
                      {unlink
                        ? "The records will remain available as unassigned. No record will be moved to Trash."
                        : permanent
                          ? "This action cannot be undone."
                          : "These records will stop contributing to calculations. Restore them together from Settings → Trash."}
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button
                    onClick={runAction}
                    type="button"
                    variant="destructive"
                  >
                    {unlink
                      ? "Remove links"
                      : permanent
                        ? "Permanently delete"
                        : "Move to Trash"}
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
  indeterminate = false,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  indeterminate?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <th className="w-10 px-3 py-3">
      <input
        aria-label="Select all visible rows"
        ref={ref}
        aria-checked={indeterminate ? "mixed" : checked}
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
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <td className="w-10 px-3 py-3">
      <input
        aria-label={`Select ${label}`}
        checked={checked}
        className="accent-primary size-4"
        disabled={disabled}
        onChange={onChange}
        type="checkbox"
      />
    </td>
  );
}
