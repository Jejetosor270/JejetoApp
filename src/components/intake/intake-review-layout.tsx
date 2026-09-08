import type { ReactNode } from "react";
export function IntakeReviewLayout({
  evidence,
  children,
  compactEvidence = false,
}: {
  evidence: ReactNode;
  children: ReactNode;
  compactEvidence?: boolean;
}) {
  if (compactEvidence)
    return (
      <div className="space-y-5">
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Extracted evidence
          </summary>
          <div className="mt-3 space-y-4">{evidence}</div>
        </details>
        {children}
      </div>
    );
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
      <aside
        aria-label="Extracted evidence"
        className="space-y-4 xl:sticky xl:top-6 xl:max-h-[calc(100svh-3rem)] xl:overflow-y-auto"
      >
        {evidence}
      </aside>
      <div className="min-w-0 space-y-5">{children}</div>
    </div>
  );
}
