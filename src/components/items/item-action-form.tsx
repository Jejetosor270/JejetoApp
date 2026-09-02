"use client";

import type { ItemActionState } from "@/domain/items/action-state";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";

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
  const { state, onSubmit, pending } = usePersistentActionState(
    action,
    initialState,
  );
  return (
    <form className={className} onSubmit={onSubmit}>
      {children}
      <button
        className="bg-primary text-primary-foreground h-9 rounded-lg px-4 text-sm font-medium disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state.message ? (
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
          {state.fieldErrors ? (
            <ul className="text-destructive list-disc pl-4 text-xs">
              {Object.entries(state.fieldErrors).map(([field, message]) => (
                <li key={field}>{message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
