"use client";

import { useActionState, useState, useTransition } from "react";

import {
  recordClientReceiptAction,
  updateClientBillingInlineAction,
} from "@/app/(app)/billing/actions";
import type { BillingActionState } from "@/domain/billing/action-state";
import {
  InlineDateInput,
  InlineEditActions,
  InlineTextInput,
} from "@/components/inline-editing/inline-edit";
import { inputClassName, SubmitButton } from "@/components/master-data/form-ui";
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
  const [state, action, pending] = useActionState(
    recordClientReceiptAction,
    initialState,
  );
  return (
    <form
      action={action}
      className="mt-2 grid gap-2 rounded-md border p-2 sm:grid-cols-5"
    >
      <input name="installmentId" type="hidden" value={installmentId} />
      <input
        aria-label={`Receipt amount ${currencyCode}`}
        className={inputClassName}
        inputMode="decimal"
        name="amount"
        placeholder={`Amount ${currencyCode}`}
        required
      />
      <input
        aria-label="Receipt date"
        className={inputClassName}
        name="receivedAt"
        required
        type="date"
      />
      <input
        aria-label="Payment reference"
        className={inputClassName}
        name="reference"
        placeholder="Reference"
      />
      <input
        aria-label="Actual receipt FX"
        className={inputClassName}
        inputMode="decimal"
        name="fxRate"
        placeholder="Actual FX if required"
      />
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
  const initial = {
    dueDate: document.dueDate ?? "",
    isCancelled: document.isCancelled,
    notes: document.notes ?? "",
    reference: document.reference,
  };
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const save = () => {
    const data = new FormData();
    data.set("id", document.id);
    data.set("reference", draft.reference);
    data.set("dueDate", draft.dueDate);
    data.set("isCancelled", String(draft.isCancelled));
    data.set("notes", draft.notes);
    startTransition(async () => {
      const result = await updateClientBillingInlineAction(data);
      setFeedback(result.message);
      if (result.status === "success") {
        setSaved(draft);
        setEditing(false);
      }
    });
  };
  return (
    <>
      <tr className="align-top">
        <td className="px-3 py-3 font-medium">{document.client.displayName}</td>
        <td className="px-3 py-3">{document.project.name}</td>
        <td className="px-3 py-3">
          {document.documentType === "QUOTE" ? "Quote / Devis" : "Invoice"}
        </td>
        <td className="px-3 py-3 font-mono text-xs">
          {editing ? (
            <InlineTextInput
              ariaLabel="Billing reference"
              onChange={(reference) =>
                setDraft((current) => ({ ...current, reference }))
              }
              value={draft.reference}
            />
          ) : (
            saved.reference
          )}
        </td>
        <td className="px-3 py-3">{formatDateOnly(document.documentDate)}</td>
        <td className="px-3 py-3">
          {editing ? (
            <InlineDateInput
              ariaLabel="Billing due date"
              onChange={(dueDate) =>
                setDraft((current) => ({ ...current, dueDate }))
              }
              value={draft.dueDate}
            />
          ) : (
            formatDateOnly(saved.dueDate)
          )}
        </td>
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
          <td className="px-3 py-3">
            <InlineEditActions
              editing={editing}
              feedback={feedback}
              onCancel={() => {
                setDraft(saved);
                setFeedback("");
                setEditing(false);
              }}
              onEdit={() => setEditing(true)}
              onSave={save}
              pending={pending}
            />
          </td>
        ) : null}
      </tr>
      {document.paymentInstallments.length > 0 || editing ? (
        <tr className="bg-muted/15">
          <td className="px-3 py-3" colSpan={canEdit ? 14 : 13}>
            {editing ? (
              <div className="flex max-w-3xl flex-wrap items-end gap-4">
                <label className="grid min-w-80 flex-1 gap-1 text-xs font-medium">
                  Notes
                  <input
                    className={inputClassName}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    value={draft.notes}
                  />
                </label>
                <label className="flex items-center gap-2 pb-2 text-xs font-medium">
                  <input
                    checked={draft.isCancelled}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        isCancelled: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  Cancelled
                </label>
              </div>
            ) : null}
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
