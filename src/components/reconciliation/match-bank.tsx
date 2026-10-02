"use client";

import Link from "next/link";
import Decimal from "decimal.js";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EditorDrawer, EditorActions } from "@/components/forms/editor-drawer";
import { DateInput } from "@/components/forms/date-input";
import {
  FilterField,
  filterControlClassName,
} from "@/components/listing/filter-field";
import {
  matchBankAction,
  searchBankAction,
  unmatchBankAction,
} from "@/app/(app)/reports/reconciliation/actions";
import type { CashCandidate } from "@/domain/reconciliation/schema";
import { addWeeksToDateOnly, formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import type { BankImportView } from "@/lib/reconciliation/service";

type BankRow = BankImportView["lines"][number];
const key = (row: CashCandidate) => `${row.kind}:${row.id}`;

export function MatchBank({
  line,
  currencyCode,
}: {
  line: BankRow;
  currencyCode: string;
}) {
  return (
    <EditorDrawer
      title={
        line.status === "UNMATCHED"
          ? "Match existing cash"
          : "Review bank match"
      }
      size="wide"
      description="Only existing payments and receipts can be matched. No cash, FX, payment date or invoice state is changed."
    >
      <MatchBankForm key={line.id} line={line} currencyCode={currencyCode} />
    </EditorDrawer>
  );
}

export function MatchBankForm({
  line: currentLine,
  currencyCode,
}: {
  line: BankRow;
  currencyCode: string;
}) {
  // An open editor retains its original server version. Refreshes must not bless
  // an old selection or discard it; closing/reopening loads a fresh snapshot.
  const [line] = useState(currentLine);
  const router = useRouter();
  const [from, setFrom] = useState(addWeeksToDateOnly(line.bookedAt, -1));
  const [to, setTo] = useState(addWeeksToDateOnly(line.bookedAt, 1));
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<CashCandidate[]>([]);
  const [selected, setSelected] = useState<CashCandidate[]>([]);
  const [searched, setSearched] = useState(false);
  const [limited, setLimited] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const selectedTotal = selected.reduce(
    (sum, row) => sum.plus(row.amount),
    new Decimal(0),
  );
  async function submit(unmatch: boolean) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = unmatch
        ? await unmatchBankAction({
            lineId: line.id,
            version: line.version,
            confirmed: true,
          })
        : await matchBankAction({
            lineId: line.id,
            version: line.version,
            selections: selected.map((row) => ({
              id: row.id,
              kind: row.kind,
              fingerprint: row.fingerprint,
            })),
            confirmed: true,
          });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
      setSelected([]);
      if (form.current) form.current.dataset.dirty = "false";
      router.refresh();
    } catch {
      setError("The match could not be saved. Your selection is preserved.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      <p className="text-sm">
        {formatDateOnly(line.bookedAt)} ·{" "}
        {line.direction === "CLIENT_RECEIPT" ? "Money in" : "Money out"} ·{" "}
        <strong className="tabular-nums">
          {formatMoney(line.amount, currencyCode)}
        </strong>
        <span className="text-muted-foreground mt-1 block break-words">
          {line.reference || line.description || "No bank reference"}
        </span>
      </p>
      {line.possibleDuplicate && (
        <p role="status" className="text-warning-foreground text-sm">
          Possible duplicate in another import. Review before matching;
          identical transactions can be legitimate.
        </p>
      )}
      {line.status === "NEEDS_REVIEW" && (
        <p role="alert" className="text-warning-foreground text-sm">
          Matched cash changed or is no longer eligible. This row is not
          confirmed as reconciled. Remove the old match, then review current
          cash.
        </p>
      )}
      {done ? (
        <p role="status">
          Saved. Cash records are unchanged. Close this drawer to continue.
        </p>
      ) : line.matches.length ? (
        <form
          ref={form}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(true);
          }}
        >
          <ul className="space-y-2">
            {line.matches.map((match) => (
              <li
                key={`${match.kind}:${match.id}`}
                className="rounded-md border p-3 text-sm"
              >
                {match.cash ? (
                  <Link
                    className="text-primary underline"
                    href={match.cash.href}
                  >
                    {match.cash.label} · {formatDateOnly(match.cash.date)} ·{" "}
                    {formatMoney(match.cash.amount, match.cash.currencyCode)}
                  </Link>
                ) : (
                  "Cash record removed, unassigned or no longer eligible"
                )}
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required disabled={pending} />
            Remove matching links only. Existing cash records will remain
            unchanged.
          </label>
          <EditorActions>
            <Button variant="outline" disabled={pending}>
              {pending ? "Saving…" : "Remove match"}
            </Button>
          </EditorActions>
        </form>
      ) : (
        <>
          <form
            className="space-y-3"
            data-draft-guard="off"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy.current) return;
              busy.current = true;
              setPending(true);
              setError("");
              try {
                const result = await searchBankAction({
                  lineId: line.id,
                  dateFrom: from,
                  dateTo: to,
                  query,
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setCandidates(result.candidates);
                setLimited(result.limited);
                setSearched(true);
              } catch {
                setError("Candidates could not be loaded. Try again.");
              } finally {
                busy.current = false;
                setPending(false);
              }
            }}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <FilterField label="Cash date from">
                <DateInput
                  name="cashDateFrom"
                  value={from}
                  disabled={pending}
                  required
                  onChange={(event) => setFrom(event.target.value)}
                />
              </FilterField>
              <FilterField label="Cash date to">
                <DateInput
                  name="cashDateTo"
                  value={to}
                  disabled={pending}
                  required
                  onChange={(event) => setTo(event.target.value)}
                />
              </FilterField>
              <FilterField label="Cash reference (optional)">
                <input
                  name="cashReference"
                  className={filterControlClassName}
                  value={query}
                  maxLength={120}
                  disabled={pending}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </FilterField>
            </div>
            <Button type="submit" variant="outline" disabled={pending}>
              Find existing cash
            </Button>
          </form>
          <form
            ref={form}
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(false);
            }}
          >
            {limited && (
              <p className="text-warning-foreground text-sm">
                Results are limited to 100 candidates. Narrow dates/reference to
                find other cash records.
              </p>
            )}
            {searched && !candidates.length && (
              <p className="text-muted-foreground text-sm">
                No eligible unmatched cash found. Change the date
                range/reference or record missing cash through its existing
                payment workflow.
              </p>
            )}
            {candidates.length > 0 && (
              <div className="max-h-80 overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left">Select existing cash</th>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((row) => (
                      <tr key={key(row)} className="border-t">
                        <td className="p-2">
                          <label className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              disabled={pending}
                              checked={selected.some(
                                (item) => key(item) === key(row),
                              )}
                              onChange={(event) =>
                                setSelected((current) =>
                                  event.target.checked
                                    ? [...current, row]
                                    : current.filter(
                                        (item) => key(item) !== key(row),
                                      ),
                                )
                              }
                            />
                            <span>
                              {row.label}
                              <span className="text-muted-foreground block text-xs">
                                {row.reference ||
                                  (row.kind === "CREDIT_REFUND"
                                    ? "Credit refund"
                                    : row.kind === "CLIENT_RECEIPT"
                                      ? "Client receipt"
                                      : row.kind === "FREIGHT_PAYMENT"
                                        ? "Freight payment"
                                        : "Supplier payment")}
                              </span>
                            </span>
                          </label>
                          <Link
                            href={row.href}
                            className="text-primary ml-6 text-xs underline"
                          >
                            Open record
                          </Link>
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {formatDateOnly(row.date)}
                        </td>
                        <td className="p-2 text-right whitespace-nowrap tabular-nums">
                          {formatMoney(row.amount, row.currencyCode)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {selected.length > 0 && (
              <section className="space-y-2">
                <p className="text-sm font-medium">
                  Selected {selected.length} cash record(s):{" "}
                  <span className="tabular-nums">
                    {formatMoney(selectedTotal.toFixed(), currencyCode)}
                  </span>
                </p>
                <p className="text-muted-foreground text-xs">
                  Selections are retained while searching. The total must equal
                  the bank amount exactly.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setSelected([])}
                >
                  Clear selection
                </Button>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    required
                    disabled={pending}
                    key={selected.map(key).join()}
                  />
                  I confirm these existing cash records correspond to this bank
                  transaction.
                </label>
                <EditorActions>
                  <Button
                    disabled={pending || !selectedTotal.equals(line.amount)}
                  >
                    {pending ? "Saving…" : "Confirm match"}
                  </Button>
                </EditorActions>
              </section>
            )}
          </form>
        </>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
