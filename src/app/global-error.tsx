"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="bg-background text-foreground flex min-h-svh items-center justify-center px-4">
          <section className="bg-card w-full max-w-md rounded-lg border p-6 text-center">
            <h1 className="text-lg font-semibold">
              MB Procurement is temporarily unavailable
            </h1>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              Reload the application. If the problem continues, contact the
              internal administrator.
            </p>
            <Button type="button" onClick={reset} className="mt-5">
              Reload application
            </Button>
          </section>
        </main>
      </body>
    </html>
  );
}
