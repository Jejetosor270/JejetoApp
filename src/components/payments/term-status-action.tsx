"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setPaymentTermCancelled } from "@/app/(app)/payments/term-actions";

export function TermStatusAction({
  id,
  kind,
  cancelled,
}: {
  id: string;
  kind: "supplier" | "client";
  cancelled: boolean;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <div>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (
            !cancelled &&
            !window.confirm(
              "Cancel the remaining payment term? Actual payment history will be retained.",
            )
          )
            return;
          const data = new FormData();
          data.set("id", id);
          data.set("kind", kind);
          data.set("cancelled", String(!cancelled));
          start(async () => {
            const result = await setPaymentTermCancelled(data);
            setMessage(result.message);
            if (result.status === "success") router.refresh();
          });
        }}
      >
        {cancelled ? "Reactivate term" : "Cancel remaining term"}
      </Button>
      {message && (
        <p role="status" className="text-xs">
          {message}
        </p>
      )}
    </div>
  );
}
