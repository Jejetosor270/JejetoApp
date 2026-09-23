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
        <h2 className="section-title">{title}</h2>
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
  valueKind = "text",
}: {
  values: {
    label: string;
    value: ReactNode;
    kind?: "text" | "financial" | "date" | "status";
  }[];
  valueKind?: "text" | "financial";
}) {
  return (
    <dl className="@container mt-4 space-y-3 text-sm">
      {values.map(({ label, value, kind = valueKind }) => (
        <div
          key={label}
          className="grid min-w-0 gap-1 @min-[22rem]:grid-cols-2 @min-[22rem]:items-baseline @min-[22rem]:gap-3"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd
            className={`min-w-0 @min-[22rem]:text-right ${kind === "text" ? "[overflow-wrap:anywhere] whitespace-normal" : "overflow-x-auto whitespace-nowrap tabular-nums"}`}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
