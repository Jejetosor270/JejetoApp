"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section role="alert" className="record-surface mx-auto max-w-xl space-y-4">
      <h1 className="text-lg font-semibold">
        This Project could not be loaded
      </h1>
      <p className="text-muted-foreground text-sm">
        Financial figures are unavailable. Try again to load the current
        records. If this followed a save, review the record before repeating it.
      </p>
      {error.digest && (
        <p className="text-muted-foreground text-xs">
          Support reference: {error.digest}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Link className="text-sm underline" href="/projects">
          Back to Projects
        </Link>
      </div>
    </section>
  );
}
