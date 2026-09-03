"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { recordClientReceiptAction } from "@/app/(app)/billing/actions";
import type { BillingActionState } from "@/domain/billing/action-state";
import { inputClassName, SubmitButton } from "@/components/master-data/form-ui";
import { Field } from "@/components/master-data/form-ui";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import type { ClientBillingView } from "@/lib/billing/billing";

const initialState: BillingActionState = { message: "", status: "idle" };

function ReceiptForm({
  currencyCode,
  installmentId,
}: {
  currencyCode: string;
  installmentId: string;
}) {
  const { state, onSubmit, pending } = usePersistentActionState(
    recordClientReceiptAction,
    initialState,
  );
  const [amount, setAmount] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [reference, setReference] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [notes, setNotes] = useState("");
  const fieldErrors = state.fieldErrors ?? {};
  return (
    <form
      className="mt-2 grid gap-2 rounded-md border p-2 sm:grid-cols-2 xl:grid-cols-5"
      onSubmit={onSubmit}
    >
      <input name="installmentId" type="hidden" value={installmentId} />
      <Field
        error={fieldErrors.amount}
        label={`Receipt amount (${currencyCode})`}
        required
      >
        <input
          className={inputClassName}
          inputMode="decimal"
          name="amount"
          onChange={(event) => setAmount(event.target.value)}
          required
          value={amount}
        />
      </Field>
      <Field
        error={fieldErrors.receivedAt}
        label="Actual payment date"
        required
      >
        <input
          className={inputClassName}
          name="receivedAt"
          onChange={(event) => setReceivedAt(event.target.value)}
          required
          type="date"
          value={receivedAt}
        />
      </Field>
      <Field error={fieldErrors.reference} label="Payment reference">
        <input
          className={inputClassName}
          name="reference"
          onChange={(event) => setReference(event.target.value)}
          value={reference}
        />
      </Field>
      <Field error={fieldErrors.fxRate} label="Actual receipt FX">
        <input
          className={inputClassName}
          inputMode="decimal"
          name="fxRate"
          onChange={(event) => setFxRate(event.target.value)}
          value={fxRate}
        />
      </Field>
      <Field error={fieldErrors.notes} label="Notes">
        <input
          className={inputClassName}
          name="notes"
          onChange={(event) => setNotes(event.target.value)}
          value={notes}
        />
      </Field>
      <SubmitButton pending={pending}>Record receipt</SubmitButton>
      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "text-destructive text-xs sm:col-span-5"
              : "text-xs sm:col-span-5"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function BillingRow({
  canEdit,
  document,
}: {
  canEdit: boolean;
  document: ClientBillingView;
}) {
  const router = useRouter();
  const href = `/billing/${document.id}`;
  return (
    <>
      <tr
        className="hover:bg-muted/30 cursor-pointer align-top"
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("a, button, input, select, textarea, form"))
            return;
          router.push(href);
        }}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (
            event.key === "Enter" &&
            !target.closest("a, button, input, select, textarea, form")
          )
            router.push(href);
        }}
        tabIndex={0}
      >
        <td className="px-3 py-3 font-medium">{document.client.displayName}</td>
        <td className="px-3 py-3">{document.project.name}</td>
        <td className="px-3 py-3">
          {document.documentType === "QUOTE" ? "Quote / Devis" : "Invoice"}
        </td>
        <td className="px-3 py-3 font-mono text-xs">
          <Link className="underline-offset-2 hover:underline" href={href}>
            {document.reference}
          </Link>
        </td>
        <td className="px-3 py-3">{formatDateOnly(document.documentDate)}</td>
        <td className="px-3 py-3">{formatDateOnly(document.dueDate)}</td>
        <td className="financial-figure px-3 py-3 text-right">
          {formatMoney(document.totalHt, document.currencyCode)}
        </td>
        <td className="financial-figure px-3 py-3 text-right">
          {formatMoney(document.vatAmount, document.currencyCode)}
        </td>
        <td className="financial-figure px-3 py-3 text-right">
          {formatMoney(document.totalTtc, document.currencyCode)}
        </td>
        <td className="financial-figure px-3 py-3 text-right">
          {formatMoney(document.paid, document.currencyCode)}
        </td>
        <td className="financial-figure px-3 py-3 text-right">
          {formatMoney(document.outstanding, document.currencyCode)}
        </td>
        <td className="px-3 py-3">{document.status.replaceAll("_", " ")}</td>
        <td className="px-3 py-3 text-center">{document.allocations.length}</td>
        {canEdit ? (
          <td className="px-3 py-3 whitespace-nowrap">
            <Link
              className="text-primary mr-3 text-xs font-medium underline"
              href={href}
            >
              View
            </Link>
            <Link
              className="text-primary text-xs font-medium underline"
              href={`${href}?edit=1`}
            >
              Edit
            </Link>
          </td>
        ) : null}
      </tr>
      {document.paymentInstallments.length > 0 ? (
        <tr className="bg-muted/15">
          <td className="px-3 py-3" colSpan={canEdit ? 14 : 13}>
            {document.paymentInstallments.length ? (
              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                {document.paymentInstallments.map((installment) => (
                  <article
                    className="bg-background rounded-md border p-3 text-xs"
                    key={installment.id}
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-medium">{installment.label}</p>
                        <p className="text-muted-foreground">
                          Due {formatDateOnly(installment.dueDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p>
                          {formatMoney(
                            installment.scheduledAmount,
                            installment.currencyCode,
                          )}
                        </p>
                        <p className="text-muted-foreground">
                          {installment.receipts.length} receipt(s)
                        </p>
                      </div>
                    </div>
                    {canEdit ? (
                      <ReceiptForm
                        currencyCode={installment.currencyCode}
                        installmentId={installment.id}
                      />
                    ) : null}
                  </article>
                ))}
              </div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function BillingTable({
  canEdit,
  documents,
}: {
  canEdit: boolean;
  documents: ClientBillingView[];
}) {
  return (
    <section className="bg-card overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[92rem] text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
            <tr>
              <th className="px-3 py-3">Client</th>
              <th className="px-3 py-3">Project</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Reference</th>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Due</th>
              <th className="px-3 py-3 text-right">HT</th>
              <th className="px-3 py-3 text-right">VAT</th>
              <th className="px-3 py-3 text-right">TTC</th>
              <th className="px-3 py-3 text-right">Paid</th>
              <th className="px-3 py-3 text-right">Outstanding</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3 text-center">Orders</th>
              {canEdit ? <th className="px-3 py-3">Edit</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {documents.map((document) => (
              <BillingRow
                canEdit={canEdit}
                document={document}
                key={document.id}
              />
            ))}
          </tbody>
        </table>
      </div>
      {documents.length === 0 ? (
        <p className="text-muted-foreground px-4 py-10 text-sm">
          No Client billing documents match these filters.
        </p>
      ) : null}
    </section>
  );
}
