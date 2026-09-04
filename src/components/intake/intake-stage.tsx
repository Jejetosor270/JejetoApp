import type { ReactNode } from "react";

export function IntakeStageHeader({
  description,
  stage,
  title,
}: {
  description?: ReactNode;
  stage: 1 | 2 | 3;
  title: string;
}) {
  return (
    <div>
      <p className="text-primary text-[0.6875rem] font-medium tracking-wide uppercase">
        Stage {stage} of 3
      </p>
      <h2 className="mt-1 text-sm font-semibold">{title}</h2>
      {description ? (
        <div className="text-muted-foreground mt-1 text-xs">{description}</div>
      ) : null}
    </div>
  );
}

export function IntakeWarning({
  children,
  title = "Review warnings",
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <section className="border-warning/40 bg-warning-muted mt-4 rounded-md border p-3 text-xs">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}
