import Link from "next/link";
import type { RecordHistoryData } from "@/domain/audit/history";
import { formatTimestamp } from "@/domain/payments/dates";
import { formatEnumLabel } from "@/domain/presentation/labels";

export function RecordHistory({
  history,
}: {
  history: RecordHistoryData | null;
}) {
  if (!history) return null;
  return (
    <section aria-label="Record activity history" className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Activity history</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Changes to this record, newest first. Historical events may not
            include before/after values.
          </p>
        </div>
        <Link
          href={history.activityHref}
          className="text-primary rounded-sm text-xs font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {history.hasMore ? "View all activity" : "Open in Activity"}
        </Link>
      </header>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[32rem] text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {history.entries.map((event) => (
              <tr key={event.id}>
                <td className="px-3 py-3 align-top whitespace-nowrap">
                  <time dateTime={event.occurredAt}>
                    {formatTimestamp(event.occurredAt)}
                  </time>
                </td>
                <td className="px-3 py-3 align-top">{event.actorName}</td>
                <td className="px-3 py-3 align-top">
                  <span className="font-medium">
                    {formatEnumLabel(event.action)}
                  </span>
                  <p className="mt-1">{event.summary}</p>
                  {event.changes.length ? (
                    <details className="mt-2">
                      <summary className="text-primary cursor-pointer">
                        Changed values ({event.changes.length})
                      </summary>
                      <dl className="mt-2 space-y-2">
                        {event.changes.map((change) => (
                          <div key={change.label}>
                            <dt className="font-medium">{change.label}</dt>
                            <dd className="financial-figure mt-0.5 break-words">
                              <span className="text-muted-foreground">
                                {change.before}
                              </span>{" "}
                              → {change.after}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  ) : null}
                </td>
              </tr>
            ))}
            {!history.entries.length ? (
              <tr>
                <td
                  colSpan={3}
                  className="text-muted-foreground px-3 py-6 text-center"
                >
                  No recorded activity for this record yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
