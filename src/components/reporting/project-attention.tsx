import Link from "next/link";
import type { AttentionIssue } from "@/domain/finance/attention";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";

function AttentionRows({ issues }: { issues: readonly AttentionIssue[] }) {
  return (
    <ul className="divide-y">
      {issues.map((issue) => (
        <li key={issue.key} className="py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Link
              href={issue.href}
              className="text-sm font-medium underline underline-offset-4"
            >
              {issue.title} · {issue.reference}
            </Link>
            <span className="text-muted-foreground text-xs">
              {issue.priority}
              {issue.date ? ` · ${formatDateOnly(issue.date)}` : ""}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">{issue.detail}</p>
          {issue.amount !== null && (
            <p className="financial-figure mt-1 text-xs">
              {formatMoney(issue.amount, issue.currency)} {issue.basis}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ProjectAttention({
  issues,
}: {
  issues: readonly AttentionIssue[];
}) {
  const urgent = issues.filter((issue) => issue.priority !== "Upcoming");
  const upcoming = issues.filter((issue) => issue.priority === "Upcoming");
  return (
    <section
      className="record-surface"
      aria-labelledby="project-attention-heading"
    >
      <h2 id="project-attention-heading" className="text-sm font-semibold">
        Needs attention{urgent.length ? ` · ${urgent.length}` : ""}
      </h2>
      <p className="text-muted-foreground mt-1 text-xs">
        This Project’s overdue payments, missing information and financial
        checks. Funding checks cover overdue amounts plus the next 30 days.
      </p>
      {urgent.length ? (
        <AttentionRows issues={urgent.slice(0, 5)} />
      ) : (
        <p className="mt-3 text-sm">No current issues detected.</p>
      )}
      {urgent.length > 5 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm">
            Show {urgent.length - 5} more issues
          </summary>
          <AttentionRows issues={urgent.slice(5)} />
        </details>
      )}
      {upcoming.length > 0 && (
        <details className="mt-3 border-t pt-3">
          <summary className="cursor-pointer text-sm">
            Upcoming · next 30 days · {upcoming.length}
          </summary>
          <AttentionRows issues={upcoming} />
        </details>
      )}
    </section>
  );
}
