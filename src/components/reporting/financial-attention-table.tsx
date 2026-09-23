"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addDays } from "date-fns";
import {
  snoozeAttention,
  unsnoozeAttention,
} from "@/app/(app)/attention-actions";
import type {
  AttentionHorizon,
  AttentionIssue,
} from "@/domain/finance/attention";
import {
  dateOnlyToDate,
  dateToDateOnly,
  formatDateOnly,
} from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  tableHeaderClassName,
  tableBodyClassName,
} from "@/components/listing/table-styles";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { DateInput } from "@/components/forms/date-input";
import { Field, inputClassName } from "@/components/master-data/form-ui";

export type AttentionRow = AttentionIssue & {
  fingerprint: string;
  snooze: { until: string; reason: string } | null;
};
export function FinancialAttentionTable({
  rows,
  today,
  horizon,
  snoozed,
}: {
  rows: AttentionRow[];
  today: string;
  horizon: AttentionHorizon;
  snoozed: boolean;
}) {
  const [editing, setEditing] = useState<AttentionRow | null>(null);
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function restore(key: string) {
    startTransition(async () => {
      try {
        const result = await unsnoozeAttention(key);
        setFeedback(result.message);
        if (result.ok) router.refresh();
      } catch {
        setFeedback("Could not restore this reminder. Please try again.");
      }
    });
  }
  return (
    <>
      {feedback && !editing && (
        <p role="status" className="p-3 text-sm">
          {feedback}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <caption className="sr-only">
            {snoozed
              ? "Your snoozed financial issues"
              : "Financial issues needing attention"}
          </caption>
          <thead className={tableHeaderClassName}>
            <tr>
              {[
                "Priority",
                "Issue",
                "Project / Record",
                "Amount",
                "Date",
                "Action",
              ].map((label) => (
                <th
                  scope="col"
                  key={label}
                  className={label === "Amount" ? "text-right" : undefined}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={tableBodyClassName}>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="px-4 py-3 align-top">
                  <Badge
                    variant={
                      row.priority === "Overdue"
                        ? "destructive"
                        : row.priority === "Upcoming"
                          ? "info"
                          : "warning"
                    }
                  >
                    {row.priority}
                  </Badge>
                </td>
                <td className="max-w-md px-4 py-3 align-top">
                  <p className="font-medium">{row.title}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {row.detail}
                  </p>
                  {row.snooze && (
                    <p className="text-muted-foreground mt-2 text-xs">
                      Snoozed until {formatDateOnly(row.snooze.until)} ·{" "}
                      {row.snooze.reason}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  <p>{row.projectName}</p>
                  {row.reference !== row.projectName && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {row.reference}
                    </p>
                  )}
                </td>
                <td className="financial-figure px-4 py-3 text-right align-top whitespace-nowrap">
                  {row.amount === null ? (
                    "—"
                  ) : (
                    <>
                      {formatMoney(row.amount, row.currency)}{" "}
                      <span className="text-muted-foreground text-xs">
                        {row.basis}
                      </span>
                    </>
                  )}
                </td>
                <td className="px-4 py-3 align-top whitespace-nowrap">
                  {row.date ? formatDateOnly(row.date) : "—"}
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-col items-start gap-2">
                    <Link
                      href={row.href}
                      className="text-primary whitespace-nowrap underline"
                      aria-label={`Open ${row.reference}`}
                    >
                      Open record
                    </Link>
                    {snoozed ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => restore(row.key)}
                      >
                        Unsnooze
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => {
                          setEditing(row);
                          setUntil(
                            dateToDateOnly(addDays(dateOnlyToDate(today), 7)),
                          );
                          setReason("");
                          setFeedback("");
                        }}
                      >
                        Snooze
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <EmptyState
          title={
            snoozed
              ? "No current issues are snoozed."
              : "No financial issues need attention in this view."
          }
        />
      )}
      {editing && (
        <EditorDrawer
          open
          size="compact"
          title="Snooze financial reminder"
          description="For you only. The reminder returns on this date, or earlier if its displayed financial information changes. Financial records and colleagues’ reminders are unaffected."
          onOpenChange={(open) => {
            if (!open && !pending) setEditing(null);
          }}
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => {
                try {
                  const result = await snoozeAttention({
                    key: editing.key,
                    fingerprint: editing.fingerprint,
                    horizon,
                    until,
                    reason,
                  });
                  setFeedback(result.message);
                  if (result.ok) {
                    setEditing(null);
                    router.refresh();
                  }
                } catch {
                  setFeedback(
                    "Could not save the snooze. Your entries are retained; please try again.",
                  );
                }
              });
            }}
          >
            <p className="text-sm font-medium">
              {editing.title} · {editing.reference}
            </p>
            <Field label="Remind me on">
              <DateInput
                name="until"
                value={until}
                onChange={(event) => setUntil(event.target.value)}
                required
                disabled={pending}
              />
            </Field>
            <Field label="Reason">
              <textarea
                name="reason"
                className={inputClassName}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                maxLength={300}
                disabled={pending}
              />
            </Field>
            {feedback && (
              <p role="alert" className="text-sm">
                {feedback}
              </p>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save snooze"}
            </Button>
          </form>
        </EditorDrawer>
      )}
    </>
  );
}
