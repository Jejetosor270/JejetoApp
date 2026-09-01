"use client";

import type { ChangeEventHandler, ReactNode } from "react";

import { Button } from "@/components/ui/button";

export const inlineControlClassName =
  "border-input bg-background h-8 min-w-20 rounded border px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

interface InputProps {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  value: string;
}

export function InlineTextInput({
  ariaLabel,
  className = "",
  disabled,
  onChange,
  value,
}: InputProps) {
  return (
    <input
      aria-label={ariaLabel}
      className={`${inlineControlClassName} ${className}`}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  );
}

export function InlineMoneyInput(props: InputProps) {
  return (
    <input
      aria-label={props.ariaLabel}
      className={`${inlineControlClassName} w-28 text-right tabular-nums ${props.className ?? ""}`}
      disabled={props.disabled}
      inputMode="decimal"
      onChange={(event) => props.onChange(event.target.value)}
      value={props.value}
    />
  );
}

export function InlinePercentInput(props: InputProps) {
  return (
    <span className="inline-flex items-center gap-1">
      <InlineMoneyInput
        {...props}
        className={`w-20 ${props.className ?? ""}`}
      />
      <span aria-hidden="true">%</span>
    </span>
  );
}

export function InlineDateInput(props: InputProps) {
  return (
    <input
      aria-label={props.ariaLabel}
      className={`${inlineControlClassName} w-28 tabular-nums ${props.className ?? ""}`}
      disabled={props.disabled}
      inputMode="numeric"
      onChange={(event) => props.onChange(event.target.value)}
      placeholder="DD/MM/YYYY"
      value={props.value}
    />
  );
}

export function InlineSelect({
  ariaLabel,
  children,
  className = "",
  disabled,
  onChange,
  value,
}: InputProps & { children: ReactNode }) {
  return (
    <select
      aria-label={ariaLabel}
      className={`${inlineControlClassName} ${className}`}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {children}
    </select>
  );
}

export function InlineCheckbox({
  ariaLabel,
  checked,
  disabled,
  onChange,
}: {
  ariaLabel: string;
  checked: boolean;
  disabled?: boolean;
  onChange: ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <input
      aria-label={ariaLabel}
      checked={checked}
      className="accent-primary size-4"
      disabled={disabled}
      onChange={onChange}
      type="checkbox"
    />
  );
}

export function InlineEditActions({
  editing,
  feedback,
  onCancel,
  onEdit,
  onSave,
  pending,
}: {
  editing: boolean;
  feedback?: string;
  onCancel: () => void;
  onEdit: () => void;
  onSave: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex min-w-28 flex-col items-end gap-1">
      <div className="flex gap-1">
        {editing ? (
          <>
            <Button disabled={pending} onClick={onSave} size="sm" type="button">
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button
              disabled={pending}
              onClick={onCancel}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button onClick={onEdit} size="sm" type="button" variant="outline">
            Edit
          </Button>
        )}
      </div>
      {feedback ? (
        <p aria-live="polite" className="max-w-52 text-right text-xs">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
