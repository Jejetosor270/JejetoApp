"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadRelatedCreation } from "@/app/(app)/related-records/create-actions";
import {
  createClientBillingInstallmentAction,
  recordClientReceiptAction,
} from "@/app/(app)/billing/actions";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { InstallmentForm, SettlementForm } from "./payment-forms";
import {
  Field,
  inputClassName,
  MoneyInput,
  SubmitButton,
  ActionFeedback,
} from "@/components/master-data/form-ui";
import { DateInput } from "@/components/forms/date-input";
import { Button } from "@/components/ui/button";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import { humanPercentageToFraction } from "@/domain/validation/percentage";
import { businessToday } from "@/domain/payments/dates";
import type { ClientBillingView } from "@/lib/billing/billing";
import type { PaymentActionState } from "@/domain/payments/action-state";
import type { BillingActionState } from "@/domain/billing/action-state";
import type { CashRecordKind } from "@/lib/related-records/types";

type Scope = { kind: "project" | "order" | "billing"; id: string };
type Data = NonNullable<
  Awaited<ReturnType<typeof loadRelatedCreation>>["data"]
>;
const titles: Record<CashRecordKind, string> = {
  payment: "Add payment",
  receipt: "Add receipt",
  "supplier-installment": "Add Supplier payment term",
  "client-installment": "Add Client payment term",
};

export function RelatedCashCreate({
  scope,
  kind,
}: {
  scope: Scope;
  kind: CashRecordKind;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {titles[kind]}
      </Button>
      <EditorDrawer title={titles[kind]} open={open} onOpenChange={setOpen}>
        {open && (
          <CreationContents
            scope={scope}
            kind={kind}
            onClose={() => setOpen(false)}
          />
        )}
      </EditorDrawer>
    </>
  );
}

function CreationContents({
  scope,
  kind,
  onClose,
}: {
  scope: Scope;
  kind: CashRecordKind;
  onClose: () => void;
}) {
  const router = useRouter();
  const [targetId, setTargetId] = useState("");
  const [installmentId, setInstallmentId] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void loadRelatedCreation(
      { kind: scope.kind, id: scope.id },
      kind,
      targetId || undefined,
    )
      .then((result) => {
        if (active) {
          setData(result.data);
          setMessage(result.message);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setData(null);
          setMessage("The form could not be loaded. Please retry.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [scope.kind, scope.id, kind, targetId, retry]);
  const saved = useCallback(() => {
    router.refresh();
    onClose();
  }, [router, onClose]);
  const form = data?.form;
  const selected =
    targetId ||
    (form?.type === "supplier" ? form.orderId : form?.document.id) ||
    "";
  const installment =
    form?.type === "supplier"
      ? form.summary.installments.find((row) => row.id === installmentId)
      : undefined;
  return (
    <div className="space-y-4">
      {message && (
        <div role="alert">
          <p>{message}</p>
          <Button
            variant="outline"
            onClick={() => {
              setLoading(true);
              setRetry((value) => value + 1);
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {data && (
        <Field
          label={
            kind === "payment" || kind === "supplier-installment"
              ? "Order"
              : "Billing document"
          }
          required
        >
          <select
            aria-label="Related document"
            className={inputClassName}
            value={selected}
            disabled={loading || data.choices.length === 1}
            onChange={(event) => {
              setTargetId(event.target.value);
              setInstallmentId("");
              setLoading(true);
            }}
          >
            <option value="">Choose a document</option>
            {data.choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      {loading ? (
        <p role="status">Loading creation form…</p>
      ) : data?.choices.length === 0 ? (
        <p>
          No eligible document is available. Receipts require an active Invoice;
          installments require an Order or a Billing document with its own
          schedule.
        </p>
      ) : form?.type === "supplier" ? (
        <>
          {kind === "supplier-installment" ? (
            <InstallmentForm
              key={form.orderId}
              baseAmount={form.summary.baseAmount}
              currencies={data?.currencies ?? []}
              defaultCurrencyCode={form.summary.baseCurrencyCode}
              direction="SUPPLIER_PAYMENT"
              orderId={form.orderId}
              reportingCurrencyCode={form.reportingCurrencyCode}
              onSaved={saved}
            />
          ) : (
            <>
              <Field label="Installment" required>
                <select
                  className={inputClassName}
                  aria-label="Installment"
                  value={installmentId}
                  onChange={(event) => setInstallmentId(event.target.value)}
                >
                  <option value="">Choose an installment</option>
                  {form.summary.installments
                    .filter((row) => !row.isCancelled && row.status !== "PAID")
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label} · {row.outstandingAmount} {row.currencyCode}
                      </option>
                    ))}
                </select>
              </Field>
              {installment ? (
                <SettlementForm
                  key={installment.id}
                  installment={installment}
                  today={businessToday()}
                  onSaved={saved}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  Choose a scheduled installment. You can add one from the
                  Supplier installments table.
                </p>
              )}
            </>
          )}
        </>
      ) : form?.type === "client" ? (
        kind === "receipt" ? (
          <ClientReceiptCreateForm
            key={form.document.id}
            document={form.document}
            onSaved={saved}
          />
        ) : (
          <InstallmentForm
            key={form.document.id}
            action={async (_: PaymentActionState, values: FormData) => {
              values.set("billingDocumentId", form.document.id);
              values.set(
                "scheduledAmount",
                String(values.get("amountDisplay") ?? ""),
              );
              const rate = humanPercentageToFraction(
                String(values.get("percentageRate") ?? ""),
                { maximumPercent: "100" },
              );
              if (rate !== null && rate !== "")
                values.set("percentageRate", rate);
              else values.delete("percentageRate");
              return createClientBillingInstallmentAction(
                { status: "idle", message: "" },
                values,
              );
            }}
            baseAmount={form.document.totalTtc}
            currencies={[{ code: form.document.currencyCode }]}
            defaultCurrencyCode={form.document.currencyCode}
            direction="CLIENT_RECEIPT"
            orderId=""
            reportingCurrencyCode={form.document.project.reportingCurrencyCode}
            hideExpectedFx
            onSaved={saved}
          />
        )
      ) : null}
    </div>
  );
}

export function ClientReceiptCreateForm({
  document,
  onSaved,
  termId,
  initialAmount = "",
}: {
  termId?: string;
  initialAmount?: string;
  document: ClientBillingView;
  onSaved: () => void;
}) {
  const { state, onSubmit, pending } = usePersistentActionState(
    recordClientReceiptAction,
    { status: "idle", message: "" } as BillingActionState,
  );
  const [amount, setAmount] = useState(initialAmount);
  const [date, setDate] = useState(businessToday());
  useEffect(() => {
    if (state.status === "success") onSaved();
  }, [state, onSaved]);
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="billingDocumentId" value={document.id} />
      <Field label={`Amount (${document.currencyCode})`} required>
        <MoneyInput
          name="amount"
          value={amount}
          onValueChange={setAmount}
          required
        />
      </Field>
      <Field label="Actual payment date" required>
        <DateInput
          name="receivedAt"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required
        />
      </Field>
      {termId ? (
        <input type="hidden" name="installmentId" value={termId} />
      ) : (
        <Field label="Payment term">
          <select className={inputClassName} name="installmentId">
            <option value="">Billing level</option>
            {document.paymentInstallments
              .filter(
                (row) =>
                  !row.isCancelled && row.billingDocumentId === document.id,
              )
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
          </select>
        </Field>
      )}
      <Field label="Reference">
        <input className={inputClassName} name="reference" />
      </Field>
      {document.currencyCode !== document.project.reportingCurrencyCode && (
        <Field
          label={`Actual FX to ${document.project.reportingCurrencyCode}`}
          required
        >
          <input
            className={inputClassName}
            name="fxRate"
            inputMode="decimal"
            required
          />
        </Field>
      )}
      <Field label="Notes">
        <input className={inputClassName} name="notes" />
      </Field>
      <ActionFeedback state={state} />
      <SubmitButton pending={pending}>Save payment</SubmitButton>
    </form>
  );
}
