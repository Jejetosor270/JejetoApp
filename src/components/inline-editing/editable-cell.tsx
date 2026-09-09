"use client";

import Link from "next/link";
import { Check, Pencil, X } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DateInput } from "@/components/forms/date-input";
import { InlineMoneyInput } from "./inline-edit";

export interface CellResult {
  status: "success" | "error";
  message?: string;
}
export interface CellOption {
  value: string;
  label: string;
}

/** Edits just one value. Blur never saves or discards a draft. */
export function EditableCell({
  label,
  value,
  display,
  canEdit,
  onSave,
  type = "text",
  options = [],
  href,
  hint,
}: {
  label: string;
  value: string;
  display: ReactNode;
  canEdit: boolean;
  onSave: (value: string, previous: string) => Promise<CellResult>;
  type?: "text" | "date" | "money" | "select";
  options?: readonly CellOption[];
  href?: string;
  hint?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [original, setOriginal] = useState(value);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const focusEditor = useCallback((element: HTMLFormElement | null) => {
    element
      ?.querySelector<HTMLElement>("input:not([type=hidden]), select")
      ?.focus();
  }, []);
  function close() {
    setEditing(false);
    setError("");
    requestAnimationFrame(() => trigger.current?.focus());
  }
  async function save() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = await onSave(draft, original);
      if (result.status === "success") {
        close();
        router.refresh();
      } else
        setError(result.message ?? "Could not save. Your change is retained.");
    } catch {
      setError("Could not save. Your change is retained; please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const open = () => {
    const activeEditor = document.querySelector<HTMLFormElement>(
      "form[data-cell-editor]",
    );
    if (activeEditor) {
      activeEditor
        .querySelector<HTMLElement>("input:not([type=hidden]), select")
        ?.focus();
      return;
    }
    setOriginal(value);
    setDraft(value);
    setError("");
    setEditing(true);
  };
  if (!editing)
    return (
      <div className="group/cell flex items-center gap-1">
        {href ? (
          <Link
            className="hover:text-primary underline-offset-4 hover:underline"
            href={href}
          >
            {display}
          </Link>
        ) : !canEdit ? (
          display
        ) : null}
        {canEdit && (
          <button
            ref={trigger}
            type="button"
            aria-label={`Edit ${label}`}
            onClick={open}
            className="hover:bg-muted focus-visible:ring-ring inline-flex min-h-8 items-center gap-2 rounded px-1 text-left focus-visible:ring-2"
          >
            {!href && display}
            <Pencil
              aria-hidden="true"
              className="text-muted-foreground size-3 shrink-0 opacity-40 group-hover/cell:opacity-100"
            />
          </button>
        )}
      </div>
    );
  const common = { value: draft, disabled: pending, "aria-label": label };
  return (
    <form
      data-cell-editor
      data-dirty={draft !== original ? "true" : "false"}
      className="min-w-36 space-y-1"
      ref={focusEditor}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!pending) close();
        }
        if (
          event.key === "Enter" &&
          !event.nativeEvent.isComposing &&
          !(event.target instanceof HTMLButtonElement)
        ) {
          event.preventDefault();
          void save();
        }
      }}
    >
      <div className="flex items-center gap-1">
        {type === "select" ? (
          <select
            {...common}
            className="border-input bg-background h-8 max-w-64 rounded border px-2 text-xs"
            onChange={(event) => setDraft(event.target.value)}
          >
            {!options.some((option) => option.value === draft) && (
              <option value={draft}>{draft || "Unassigned"}</option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : type === "date" ? (
          <DateInput
            {...common}
            className="border-input h-8 rounded border px-2 text-xs"
            onChange={(event) => setDraft(event.target.value)}
          />
        ) : type === "money" ? (
          <InlineMoneyInput
            ariaLabel={label}
            value={draft}
            disabled={pending}
            onChange={setDraft}
          />
        ) : (
          <input
            {...common}
            className="border-input bg-background h-8 max-w-64 rounded border px-2 text-xs"
            onChange={(event) => setDraft(event.target.value)}
          />
        )}
        <button
          type="submit"
          disabled={pending}
          aria-label={`Save ${label}`}
          className="hover:bg-muted focus-visible:ring-ring rounded p-1 focus-visible:ring-2 disabled:opacity-50"
        >
          <Check className="size-4" />
        </button>
        <button
          type="button"
          disabled={pending}
          aria-label={`Cancel editing ${label}`}
          onClick={close}
          className="hover:bg-muted focus-visible:ring-ring rounded p-1 focus-visible:ring-2 disabled:opacity-50"
        >
          <X className="size-4" />
        </button>
      </div>
      {hint && <p className="text-muted-foreground max-w-64 text-xs">{hint}</p>}
      <p className="text-muted-foreground max-w-64 text-xs">
        Save or cancel before editing another cell.
      </p>
      {pending && (
        <p role="status" className="text-xs">
          Saving…
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive max-w-64 text-xs">
          {error}
        </p>
      )}
    </form>
  );
}

export function SourceCell({
  children,
  href,
  label,
  canEdit,
}: {
  children: ReactNode;
  href: string;
  label: string;
  canEdit: boolean;
}) {
  return canEdit ? (
    <Link
      href={href}
      aria-label={`Edit ${label}`}
      title="Edit the underlying records"
      className="hover:bg-muted focus-visible:ring-ring inline-flex min-h-8 items-center gap-2 rounded px-1 focus-visible:ring-2"
    >
      {children}
      <Pencil
        aria-hidden="true"
        className="text-muted-foreground size-3 shrink-0"
      />
    </Link>
  ) : (
    children
  );
}
