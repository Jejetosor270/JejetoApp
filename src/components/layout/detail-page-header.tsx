import { ReturnLink } from "@/components/layout/return-navigation";
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
    <header className="pb-1">
      <ReturnLink
        className="text-muted-foreground text-xs hover:underline"
        href={backHref}
      >
        ← {backLabel}
      </ReturnLink>
      <p className="text-muted-foreground mt-4 text-xs">{eyebrow}</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] leading-8 font-semibold tracking-tight">
            {title}
          </h1>
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
