import type { ReactNode } from "react";

export function IntakeStageHeader({
  description,
  stage,
  title,
  processing = false,
}: {
  description?: ReactNode;
  stage: 1 | 2 | 3;
  title: string;
  processing?: boolean;
}) {
  return (
    <div className="space-y-3">
      <ol
        aria-label="Document intake progress"
        className="flex flex-wrap gap-x-4 gap-y-2 text-xs"
      >
        {[
          "Context",
          "Upload",
          "Processing",
          "Review",
          "Warnings",
          "Confirm",
        ].map((label, index) => {
          const active =
            stage === 1 ? (processing ? 2 : 1) : stage === 2 ? 3 : 5;
          return (
            <li
              key={label}
              aria-current={index === active ? "step" : undefined}
              className={
                index === active
                  ? "text-primary font-semibold"
                  : "text-muted-foreground"
              }
            >
              <span aria-hidden="true" className="mr-1.5">
                {index + 1}.
              </span>
              {label}
            </li>
          );
        })}
      </ol>
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
    <section
      role="status"
      className="border-warning/40 bg-warning-muted mt-4 rounded-md border p-3 text-xs"
    >
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}
