"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import { saveCreditAction } from "@/app/(app)/credit-actions";
import type { CreditWorkspace } from "@/lib/credits/service";
import { EditorDrawer, EditorActions } from "@/components/forms/editor-drawer";
import { DateInput } from "@/components/forms/date-input";
import { Field, inputClassName } from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { businessToday, formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";

type Kind = Parameters<typeof saveCreditAction>[0];
function MoneyInput({
  name,
  label,
  value = "0",
  required = true,
}: {
  name: string;
  label: string;
  value?: string;
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <input
        className={inputClassName}
        name={name}
        inputMode="decimal"
        defaultValue={value}
        required={required}
      />
    </Field>
  );
}

export function CreditForm({
  workspace,
  kind,
  creditId,
  refundId,
}: {
  workspace: CreditWorkspace;
  kind: Kind;
  creditId?: string;
  refundId?: string;
}) {
  const [snapshot] = useState(workspace);
  const [feedback, setFeedback] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const cancellation = kind.startsWith("cancel-");
  return (
    <form
      ref={form}
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy.current || done) return;
        const fields = new FormData(event.currentTarget);
        const text = (name: string) => String(fields.get(name) ?? "");
        let input: unknown;
        if (kind === "credit")
          input = {
            side: snapshot.side,
            sourceId: snapshot.sourceId,
            expectedVersion: snapshot.expectedVersion,
            reference: text("reference"),
            creditDate: text("date"),
            reason: text("reason"),
            totalHt: text("totalHt"),
            vatAmount: text("vatAmount"),
            freightCoverageHt: text("freightCoverageHt") || "0",
            otherCoverageHt: text("otherCoverageHt") || "0",
            ...(snapshot.side === "SUPPLIER" && snapshot.supplierVatEntry
              ? { supplierVatEntryId: snapshot.supplierVatEntry.id }
              : {}),
            allocations: snapshot.orderAllocations
              .filter((row) => fields.get(`allocate-${row.orderId}`) === "on")
              .map((row) => ({
                orderId: row.orderId,
                amountHt: text(`amount-${row.orderId}`),
                freightCoverageHt: text(`freight-${row.orderId}`),
                otherCoverageHt: text(`other-${row.orderId}`),
              })),
          };
        else if (kind === "refund")
          input = {
            side: snapshot.side,
            creditId,
            expectedVersion: snapshot.expectedVersion,
            amount: text("amount"),
            refundDate: text("date"),
            fxRate: text("fxRate"),
            reference: text("reference"),
            notes: text("notes"),
          };
        else
          input = {
            ...(kind === "cancel-credit" ? { creditId } : { refundId }),
            expectedVersion: snapshot.expectedVersion,
            reason: text("reason"),
          };
        busy.current = true;
        startTransition(async () => {
          try {
            const result = await saveCreditAction(kind, input);
            setFeedback(result.message);
            if (result.ok) {
              setDone(true);
              if (form.current) form.current.dataset.dirty = "false";
              router.refresh();
            }
          } catch {
            setFeedback("Could not save. Your complete draft is retained.");
          } finally {
            busy.current = false;
          }
        });
      }}
    >
      <fieldset disabled={pending || done} className="space-y-4">
        {!cancellation && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reference">
              <input
                name="reference"
                className={inputClassName}
                maxLength={120}
                required={kind === "credit"}
              />
            </Field>
            <Field
              label={kind === "credit" ? "Credit date" : "Actual refund date"}
            >
              <DateInput name="date" defaultValue={businessToday()} required />
            </Field>
          </div>
        )}
        {kind === "credit" && (
          <>
            <p className="text-muted-foreground text-sm">
              Amounts in {snapshot.currencyCode}. This records an adjustment—not
              cash. Original Invoice/Order values remain unchanged.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyInput
                name="totalHt"
                label={
                  snapshot.side === "SUPPLIER"
                    ? "Product purchase credit HT"
                    : "Credit HT"
                }
              />
              <MoneyInput name="vatAmount" label="Credit VAT" />
            </div>
            {snapshot.side === "SUPPLIER" ? (
              <p className="text-muted-foreground text-xs">
                Supplier credits reduce product purchase cost and eligible
                invoice VAT. Client selling prices, freight and other cost lines
                stay unchanged.{" "}
                {snapshot.supplierVatEntry
                  ? "VAT uses the original input VAT treatment and recoverability."
                  : "No eligible payable input VAT; enter zero VAT."}
              </p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <MoneyInput
                    name="freightCoverageHt"
                    label="Freight portion HT"
                  />
                  <MoneyInput
                    name="otherCoverageHt"
                    label="Other/services portion HT"
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  Merchandise is the remaining portion of credit HT. Choose
                  credited Orders explicitly. Any unallocated credit remains at
                  Project level.
                </p>
                {snapshot.orderAllocations.map((row) => (
                  <fieldset
                    key={row.orderId}
                    className="space-y-3 rounded-md border p-3"
                  >
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name={`allocate-${row.orderId}`} />
                      {row.reference} · available allocation{" "}
                      {formatMoney(row.amountHt, snapshot.currencyCode)}
                    </label>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <MoneyInput
                        name={`amount-${row.orderId}`}
                        label="Credit allocation HT"
                      />
                      <MoneyInput
                        name={`freight-${row.orderId}`}
                        label="Freight portion HT"
                      />
                      <MoneyInput
                        name={`other-${row.orderId}`}
                        label="Other portion HT"
                      />
                    </div>
                  </fieldset>
                ))}
              </>
            )}
          </>
        )}
        {kind === "refund" && (
          <>
            <p className="text-sm">
              {snapshot.side === "CLIENT"
                ? "Actual cash returned to the Client (money out)."
                : "Actual refund received from the Supplier (money in)."}{" "}
              Record only money that has moved.
            </p>
            <MoneyInput
              name="amount"
              label={`Refund amount ${snapshot.currencyCode}`}
              value=""
            />
            {snapshot.currencyCode !== snapshot.reportingCurrencyCode && (
              <MoneyInput
                name="fxRate"
                label={`Actual FX: 1 ${snapshot.currencyCode} = … ${snapshot.reportingCurrencyCode}`}
                value=""
              />
            )}
            <Field label="Notes">
              <textarea
                className={inputClassName}
                name="notes"
                maxLength={4000}
              />
            </Field>
          </>
        )}
        {(kind === "credit" || cancellation) && (
          <Field label={cancellation ? "Correction reason" : "Credit reason"}>
            <textarea
              className={inputClassName}
              name="reason"
              required
              maxLength={4000}
            />
          </Field>
        )}
        {cancellation && (
          <p className="text-sm">
            This corrects the recorded credit/refund and retains its audit
            history. It does not move money. Cancel actual refunds before
            cancelling their credit.
          </p>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" required />I have reviewed this{" "}
          {cancellation ? "correction" : kind} and confirm it is accurate.
        </label>
        <EditorActions>
          <Button type="submit">
            {pending
              ? "Saving…"
              : cancellation
                ? "Confirm correction"
                : kind === "credit"
                  ? "Record credit"
                  : "Record actual refund"}
          </Button>
        </EditorActions>
      </fieldset>
      {feedback && (
        <p role={done ? "status" : "alert"} className="text-sm">
          {feedback}
          {done && " Close this drawer to continue."}
        </p>
      )}
    </form>
  );
}

export function CreditPanel({
  workspace,
  canEdit,
}: {
  workspace: CreditWorkspace | null;
  canEdit: boolean;
}) {
  if (!workspace)
    return (
      <p className="text-muted-foreground text-sm">
        Credits are available on active Supplier Orders and issued Client
        Invoices with party and currency information.
      </p>
    );
  const editable = canEdit && !workspace.blockedReason;
  const money = (value: string, currencyCode = workspace.currencyCode) =>
    formatMoney(value, currencyCode);
  return (
    <section
      className="record-surface space-y-4 p-4"
      aria-label="Credits and refunds"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title">Credits & refunds</h2>
        {editable && (
          <EditorDrawer title="Record credit">
            <CreditForm workspace={workspace} kind="credit" />
          </EditorDrawer>
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        Credits adjust commercial balances. Refunds are separate actual cash.
        Original documents, allocations and payments remain in their history.
      </p>
      {workspace.blockedReason ? (
        <p role="alert">{workspace.blockedReason}</p>
      ) : (
        workspace.cash && (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            {(
              [
                ["Original TTC", workspace.original.totalTtc],
                ["Credits TTC", workspace.remaining.creditedTtc],
                ["Net due TTC", workspace.cash.netDue],
                ["Remaining to settle TTC", workspace.cash.outstanding],
                ["Actual refunds TTC", workspace.cash.refundedTtc],
                ["Refund due TTC", workspace.cash.refundDue],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium tabular-nums">{money(value)}</dd>
              </div>
            ))}
          </dl>
        )
      )}
      {!workspace.credits.length ? (
        <p className="text-muted-foreground text-sm">No credits recorded.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left">Reference / date</th>
                <th className="p-2 text-right">Credit HT</th>
                <th className="p-2 text-right">VAT</th>
                <th className="p-2 text-left">Status / actions</th>
              </tr>
            </thead>
            <tbody>
              {workspace.credits.map((credit) => (
                <tr key={credit.id} className="border-t align-top">
                  <td className="p-2">
                    <p>{credit.reference}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatDateOnly(credit.creditDate)}
                    </p>
                    <p className="max-w-sm text-xs break-words">
                      {credit.reason}
                    </p>
                    {credit.allocations.map((row) => (
                      <p
                        key={row.orderId}
                        className="text-muted-foreground text-xs"
                      >
                        {workspace.orderAllocations.find(
                          (order) => order.orderId === row.orderId,
                        )?.reference ?? "Linked Order"}
                        : {money(row.amountHt, credit.currencyCode)}
                      </p>
                    ))}
                  </td>
                  <td className="p-2 text-right whitespace-nowrap tabular-nums">
                    {money(credit.totalHt, credit.currencyCode)}
                  </td>
                  <td className="p-2 text-right whitespace-nowrap tabular-nums">
                    {money(credit.vatAmount, credit.currencyCode)}
                  </td>
                  <td className="space-y-2 p-2">
                    <Badge variant={credit.isCancelled ? "neutral" : "info"}>
                      {credit.isCancelled ? "Cancelled" : "Recorded"}
                    </Badge>
                    {editable && !credit.isCancelled && (
                      <div className="flex flex-wrap gap-2">
                        {workspace.cash &&
                          new Decimal(workspace.cash.refundDue).gt(0) && (
                            <EditorDrawer title="Record actual refund">
                              <CreditForm
                                workspace={workspace}
                                kind="refund"
                                creditId={credit.id}
                              />
                            </EditorDrawer>
                          )}
                        {!credit.refunds.some(
                          (refund) => !refund.isCancelled,
                        ) && (
                          <EditorDrawer title="Cancel credit">
                            <CreditForm
                              workspace={workspace}
                              kind="cancel-credit"
                              creditId={credit.id}
                            />
                          </EditorDrawer>
                        )}
                      </div>
                    )}
                    {credit.refunds.map((refund) => (
                      <div
                        key={refund.id}
                        className="rounded-md border p-2 text-xs"
                      >
                        <p>
                          {workspace.side === "CLIENT"
                            ? "Refund paid"
                            : "Refund received"}
                          : {money(refund.amount, credit.currencyCode)} ·{" "}
                          {formatDateOnly(refund.refundDate)}
                          {refund.isCancelled && " · Cancelled correction"}
                        </p>
                        {refund.reference && <p>{refund.reference}</p>}
                        {editable && !refund.isCancelled && (
                          <EditorDrawer title="Correct refund">
                            <CreditForm
                              workspace={workspace}
                              kind="cancel-refund"
                              refundId={refund.id}
                            />
                          </EditorDrawer>
                        )}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
