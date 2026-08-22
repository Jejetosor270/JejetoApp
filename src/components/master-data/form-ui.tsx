"use client";

import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import type { MasterDataActionState } from "@/components/master-data/action-state";
import { Button } from "@/components/ui/button";

export const inputClassName =
  "border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

export function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

export function ActionFeedback({ state }: { state: MasterDataActionState }) {
  if (!state.message || !state.status) return null;
  return (
    <p
      className={
        state.status === "error"
          ? "text-destructive text-sm"
          : "text-positive text-sm"
      }
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

export function SubmitButton({
  children,
  pending,
}: {
  children: ReactNode;
  pending: boolean;
}) {
  return (
    <Button disabled={pending} type="submit">
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
