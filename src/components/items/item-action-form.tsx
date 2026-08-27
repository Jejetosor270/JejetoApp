"use client";

import { useActionState } from "react";

import type { ItemActionState } from "@/domain/items/action-state";

const initialState: ItemActionState = { message: "", status: "idle" };

export function ItemActionForm({
  action,
  children,
  className,
}: {
  action: (state: ItemActionState, data: FormData) => Promise<ItemActionState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className={className}>
      {children}
      <button
        className="bg-primary text-primary-foreground h-9 rounded-lg px-4 text-sm font-medium disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state.message ? (
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
      ) : null}
    </form>
  );
}
