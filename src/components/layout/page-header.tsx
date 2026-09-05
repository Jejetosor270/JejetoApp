import type { ReactNode } from "react";
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1.5">
        <h1 className="text-[26px] leading-8 font-semibold tracking-tight">
          {title}
        </h1>
        {description && (
          <div className="text-muted-foreground max-w-3xl text-sm">
            {description}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
