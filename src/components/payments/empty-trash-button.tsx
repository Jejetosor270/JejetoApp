"use client";
import { useActionState, useState } from "react";
import { emptyTrashAction } from "@/app/(app)/settings/trash/purge-action";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { Button } from "@/components/ui/button";
import { Field, inputClassName } from "@/components/master-data/form-ui";
import type { BulkActionState } from "@/domain/deletion/action-state";

export function EmptyTrashButton() {
  const [state, action, pending] = useActionState(emptyTrashAction, {
    status: "error",
    message: "",
  } as BulkActionState);
  const [confirmation, setConfirmation] = useState("");
  return (
    <EditorDrawer title="Empty Trash permanently">
      <form action={action} className="space-y-4">
        <p>
          All records currently in Trash and their dependent data will be
          permanently deleted. They cannot be restored. The audit log will
          remain.
        </p>
        <Field label="Type EMPTY TRASH to confirm">
          <input
            className={inputClassName}
            name="confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Button
          variant="destructive"
          type="submit"
          disabled={
            pending ||
            confirmation !== "EMPTY TRASH" ||
            state.status === "success"
          }
        >
          {pending ? "Emptying Trash…" : "Permanently empty Trash"}
        </Button>
        {state.message && (
          <p role={state.status === "error" ? "alert" : "status"}>
            {state.message}
          </p>
        )}
      </form>
    </EditorDrawer>
  );
}
