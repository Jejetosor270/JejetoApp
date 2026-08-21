"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function WorkspaceError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[28rem] items-center justify-center">
      <section className="bg-card w-full max-w-lg rounded-lg border p-6 text-center shadow-sm">
        <span className="bg-destructive/10 text-destructive mx-auto flex size-10 items-center justify-center rounded-full">
          <AlertTriangle aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">
          This view could not be loaded
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          The error was contained. Try the request again; no financial data was
          changed.
        </p>
        <Button type="button" className="mt-5" onClick={reset}>
          <RotateCcw aria-hidden="true" data-icon="inline-start" />
          Try again
        </Button>
      </section>
    </div>
  );
}
