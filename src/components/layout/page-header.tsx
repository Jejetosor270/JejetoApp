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
    <header className="flex flex-col items-start justify-between gap-4 border-b pb-5 sm:flex-row sm:flex-wrap">
      <div className="min-w-0 flex-1 space-y-1.5">
        <h1 className="page-title">{title}</h1>
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
