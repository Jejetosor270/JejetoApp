import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <section className="w-full max-w-md text-center">
        <p className="text-muted-foreground font-mono text-xs font-semibold tracking-[0.12em] uppercase">
          404
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          This module may not exist yet, or the address is incorrect.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/">
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            Return to dashboard
          </Link>
        </Button>
      </section>
    </main>
  );
}
