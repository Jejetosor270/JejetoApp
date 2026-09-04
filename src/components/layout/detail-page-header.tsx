import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { formatEnumLabel } from "@/domain/presentation/labels";

export function DetailPageHeader({
  actions,
  backHref,
  backLabel,
  eyebrow,
  meta,
  status,
  title,
}: {
  actions?: ReactNode;
  backHref: string;
  backLabel: string;
  eyebrow: string;
  meta?: ReactNode;
  status?: string | null;
  title: ReactNode;
}) {
  return (
    <header className="bg-card rounded-lg border p-5">
      <Link
        className="text-muted-foreground text-xs hover:underline"
        href={backHref}
      >
        ← {backLabel}
      </Link>
      <p className="text-primary mt-3 text-xs font-medium tracking-[0.08em] uppercase">
        {eyebrow}
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {status ? (
            <Badge variant="outline">{formatEnumLabel(status)}</Badge>
          ) : null}
        </div>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>
      {meta ? (
        <div className="text-muted-foreground mt-2 text-sm">{meta}</div>
      ) : null}
    </header>
  );
}
