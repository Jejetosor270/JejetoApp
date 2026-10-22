"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  loadCashMoveOptions,
  moveCashAction,
} from "@/app/(app)/payments/move-actions";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { Field, inputClassName } from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/domain/procurement/presentation";
import type {
  CashMoveKind,
  CashMoveOptions,
} from "@/domain/payments/cash-move";

export function CashMoveEditor({
  kind,
  id,
  onMoved,
  disabled = false,
}: {
  kind: CashMoveKind;
  id: string;
  onMoved?: (() => void) | undefined;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<CashMoveOptions | null>(null);
  const [sourceVersion, setSourceVersion] = useState("");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const title = kind === "SUPPLIER_PAYMENT" ? "Move payment" : "Move receipt";
  function load(projectId?: string, initial = false) {
    setTargetId("");
    setConfirmed(false);
    setMessage("");
    startTransition(async () => {
      try {
        const result = await loadCashMoveOptions({
          kind,
          id,
          ...(projectId ? { projectId } : {}),
          ...(initial || !search.trim() ? {} : { search: search.trim() }),
        });
        setOptions(result.options);
        if (initial) setSourceVersion(result.options?.sourceVersion ?? "");
        setMessage(result.message);
      } catch {
        setMessage("Destinations could not be loaded. Try again.");
      }
    });
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={disabled}
        onClick={() => {
          setReason("");
          setSearch("");
          setOptions(null);
          setOpen(true);
          load(undefined, true);
        }}
      >
        {title}
      </Button>
      {open && (
        <EditorDrawer
          open
          title={title}
          onOpenChange={setOpen}
          description="Reassign existing cash. Its amount, date and actual FX stay unchanged."
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (pending) return;
              const target = options?.targets.find(
                (row) => row.id === targetId,
              );
              startTransition(async () => {
                try {
                  const result = await moveCashAction({
                    kind,
                    id,
                    targetId,
                    sourceVersion,
                    targetVersion: target?.version ?? "",
                    reason,
                    confirmed: confirmed ? "yes" : "",
                  });
                  setMessage(result.message);
                  if (result.success) {
                    setOpen(false);
                    onMoved?.();
                    router.refresh();
                  }
                } catch {
                  setMessage(
                    "The move could not be saved. Your draft is retained.",
                  );
                }
              });
            }}
          >
            {options && (
              <>
                <p className="text-sm">
                  {options.sourceLabel} ·{" "}
                  <span className="financial-figure">
                    {formatMoney(options.amount, options.currencyCode)}
                  </span>
                </p>
                <Field label="Project">
                  <select
                    className={inputClassName}
                    name="projectId"
                    value={options.projectId}
                    disabled={pending}
                    onChange={(event) => load(event.target.value)}
                  >
                    {options.projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="flex items-end gap-2">
                  <Field label="Find destination">
                    <input
                      className={inputClassName}
                      name="search"
                      value={search}
                      maxLength={120}
                      disabled={pending}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => load(options.projectId)}
                  >
                    Search
                  </Button>
                </div>
                {options.limited && (
                  <p className="text-muted-foreground text-sm">
                    First 100 matching records checked. Search by reference or
                    description to narrow the list.
                  </p>
                )}
                <Field
                  label={
                    kind === "SUPPLIER_PAYMENT" ? "Payment term" : "Invoice"
                  }
                  required
                >
                  <select
                    className={inputClassName}
                    name="targetId"
                    required
                    value={targetId}
                    disabled={pending}
                    onChange={(event) => {
                      setTargetId(event.target.value);
                      setConfirmed(false);
                    }}
                  >
                    <option value="">Choose destination</option>
                    {options.targets.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.label} ·{" "}
                        {formatMoney(target.remaining, options.currencyCode)}{" "}
                        available
                      </option>
                    ))}
                  </select>
                </Field>
                {!options.targets.length && (
                  <p className="text-muted-foreground text-sm">
                    No eligible destination in these results. Search by
                    reference or description, or choose another Project.
                  </p>
                )}
                {kind === "CLIENT_RECEIPT" && (
                  <p className="text-muted-foreground text-sm">
                    The receipt moves to Invoice level. Assign it to a payment
                    term afterwards if needed.
                  </p>
                )}
                <Field label="Correction reason" required>
                  <input
                    className={inputClassName}
                    name="reason"
                    value={reason}
                    required
                    minLength={3}
                    maxLength={240}
                    disabled={pending}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </Field>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="confirmed"
                    checked={confirmed}
                    disabled={pending}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    required
                  />
                  I confirm this destination. Existing bank matches will require
                  review.
                </label>
                <Button
                  type="submit"
                  disabled={pending || !targetId || !confirmed}
                >
                  {pending ? "Moving…" : title}
                </Button>
              </>
            )}
            {pending && !options && <p role="status">Loading destinations…</p>}
            {message && (
              <p role="alert" className="text-destructive text-sm">
                {message}
              </p>
            )}
          </form>
        </EditorDrawer>
      )}
    </>
  );
}
