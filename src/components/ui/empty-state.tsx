import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="bg-muted/30 space-y-2 rounded-md px-4 py-10 text-center text-sm">
      <p className="font-medium">{title}</p>
      {description ? (
        <p className="text-muted-foreground mx-auto max-w-md text-xs leading-5">
          {description}
        </p>
      ) : null}
      {action ? <div className="flex justify-center">{action}</div> : null}
    </div>
  );
}
