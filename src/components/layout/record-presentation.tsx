import type { ReactNode } from "react";

/** Purchasing's compact record hierarchy, shared across record workspaces. */
export function RecordSectionHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="text-muted-foreground mt-1 text-xs">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

export function RecordSummary({
  values,
}: {
  values: { label: string; value: string }[];
}) {
  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      {values.map(({ label, value }) => (
        <div key={label} className="min-w-0 border-b py-4">
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd className="financial-figure mt-2 text-lg font-semibold">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function RecordFields({
  values,
}: {
  values: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="mt-4 space-y-2 text-sm">
      {values.map(({ label, value }) => (
        <div key={label} className="grid grid-cols-2 items-baseline gap-3">
          <dt>{label}</dt>
          <dd className="financial-figure min-w-0 text-right break-words">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
