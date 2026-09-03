"use client";

import { LoaderCircle } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { MasterDataActionState } from "@/components/master-data/action-state";
import { Button } from "@/components/ui/button";
import {
  formatMoneyInput,
  formatPercentageInput,
  normalizeMoneyInput,
} from "@/domain/procurement/presentation";

export const inputClassName =
  "border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

export function Field({
  children,
  error,
  label,
  required = false,
}: {
  children: ReactNode;
  error?: string | undefined;
  label: string;
  required?: boolean | undefined;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive ml-1">
            *
          </span>
        ) : null}
      </span>
      {children}
      {error ? (
        <span className="text-destructive text-xs" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function MoneyInput({
  className = inputClassName,
  defaultValue = "",
  disabled = false,
  invalid = false,
  name,
  onValueChange,
  placeholder = "0.00",
  required = false,
  value,
}: {
  className?: string | undefined;
  defaultValue?: string | null | undefined;
  disabled?: boolean | undefined;
  invalid?: boolean | undefined;
  name: string;
  onValueChange?: ((value: string) => void) | undefined;
  placeholder?: string | undefined;
  required?: boolean | undefined;
  value?: string | undefined;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const [focused, setFocused] = useState(false);
  const rawValue = value ?? internalValue;
  const [draftValue, setDraftValue] = useState(rawValue);
  const submittedValue = focused ? draftValue : rawValue;
  const normalizedValue = normalizeMoneyInput(submittedValue);
  const setValue = (nextValue: string) => {
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  };
  return (
    <>
      <input
        aria-invalid={invalid || undefined}
        className={`${className}${invalid ? "border-destructive focus-visible:border-destructive" : ""}`}
        disabled={disabled}
        inputMode="decimal"
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          const next = event.target.value;
          setDraftValue(next);
          const normalized = normalizeMoneyInput(next);
          setValue(normalized === null ? next : normalized);
        }}
        onFocus={() => {
          setDraftValue(rawValue);
          setFocused(true);
        }}
        placeholder={placeholder}
        required={required}
        value={focused ? draftValue : formatMoneyInput(rawValue)}
      />
      <input
        disabled={disabled}
        name={name}
        type="hidden"
        value={normalizedValue === null ? submittedValue : normalizedValue}
      />
    </>
  );
}

export function PercentageInput({
  ariaLabel,
  className = inputClassName,
  defaultValue = "",
  disabled = false,
  invalid = false,
  name,
  onValueChange,
  placeholder = "0",
  required = false,
  value,
}: {
  ariaLabel?: string | undefined;
  className?: string | undefined;
  defaultValue?: string | null | undefined;
  disabled?: boolean | undefined;
  invalid?: boolean | undefined;
  name?: string | undefined;
  onValueChange?: ((value: string) => void) | undefined;
  placeholder?: string | undefined;
  required?: boolean | undefined;
  value?: string | undefined;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const [focused, setFocused] = useState(false);
  const rawValue = value ?? internalValue;
  const [draftValue, setDraftValue] = useState(rawValue);
  const submittedValue = focused ? draftValue : rawValue;
  const setValue = (nextValue: string) => {
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  };
  return (
    <>
      <input
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={`${className}${invalid ? "border-destructive focus-visible:border-destructive" : ""}`}
        disabled={disabled}
        inputMode="decimal"
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          setDraftValue(event.target.value);
          setValue(event.target.value);
        }}
        onFocus={() => {
          setDraftValue(rawValue);
          setFocused(true);
        }}
        placeholder={placeholder}
        required={required}
        value={focused ? draftValue : formatPercentageInput(rawValue)}
      />
      {name ? (
        <input
          disabled={disabled}
          name={name}
          type="hidden"
          value={submittedValue}
        />
      ) : null}
    </>
  );
}

export function ActionFeedback({ state }: { state: MasterDataActionState }) {
  if (!state.message || !state.status) return null;
  return (
    <div role={state.status === "error" ? "alert" : "status"}>
      <p
        className={
          state.status === "error"
            ? "text-destructive text-sm"
            : "text-positive text-sm"
        }
      >
        {state.message}
      </p>
      {state.status === "error" && state.fieldErrors ? (
        <ul className="text-destructive mt-1 list-disc pl-4 text-xs">
          {Object.entries(state.fieldErrors).map(([field, message]) => (
            <li key={field}>{message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  children,
  disabled = false,
  pending,
}: {
  children: ReactNode;
  disabled?: boolean | undefined;
  pending: boolean;
}) {
  return (
    <Button disabled={disabled || pending} type="submit">
      {pending ? (
        <LoaderCircle
          aria-hidden="true"
          className="animate-spin"
          data-icon="inline-start"
        />
      ) : null}
      {children}
    </Button>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "bg-positive-muted text-positive inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
          : "border-border text-muted-foreground inline-flex rounded-full border px-2 py-0.5 text-xs font-medium"
      }
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}
