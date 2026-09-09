"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { restoreTrashAction } from "@/app/(app)/settings/trash/actions";
export function TrashRestoreButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return (
    <div>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError("");
            try {
              const data = new FormData();
              data.set("batchId", batchId);
              const result = await restoreTrashAction(data);
              if (result.status === "success") router.refresh();
              else setError(result.message);
            } catch {
              setError("Unable to restore. Please try again.");
            }
          })
        }
      >
        {pending ? "Restoring…" : "Restore"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive mt-2 text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
