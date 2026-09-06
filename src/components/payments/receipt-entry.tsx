"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  loadReceiptEntryOptions,
  recordReceiptEntryAction,
} from "@/app/(app)/payments/receipt-actions";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { DateInput } from "@/components/forms/date-input";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import {
  Field,
  inputClassName,
  MoneyInput,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import { InstallmentForm } from "@/components/payments/payment-forms";
import { initialPaymentActionState } from "@/domain/payments/action-state";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import type { ReceiptEntryOptions } from "@/lib/payments/receipt-entry";

interface Props {
  projects: { id: string; name: string }[];
  currencies: { code: string }[];
  today: string;
}

export function ReceiptEntry(props: Props) {
  return (
    <EditorDrawer
      title="Record receipt"
      trigger={<Button>Record receipt</Button>}
    >
      <ReceiptEntryForm {...props} />
    </EditorDrawer>
  );
}

export function ReceiptEntryForm({ projects, currencies, today }: Props) {
  const router = useRouter();
  const [type, setType] = useState("SUPPLIER");
  const [projectId, setProjectId] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [installmentId, setInstallmentId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [options, setOptions] = useState<ReceiptEntryOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [addingInstallment, setAddingInstallment] = useState(false);
  const request = useRef(0);
  const { state, pending, onSubmit } = usePersistentActionState(
    recordReceiptEntryAction,
    initialPaymentActionState,
  );
  const supplier = type === "SUPPLIER";
  const documents = supplier ? options?.orders : options?.billing;
  const selected = documents?.find((item) => item.id === documentId);
  const order = supplier
    ? options?.orders.find((item) => item.id === documentId)
    : undefined;
  const installments = selected?.installments ?? [];
  const selectedInstallment = installments.find(
    (item) => item.id === installmentId,
  );
  const currency =
    supplier && selectedInstallment && "currencyCode" in selectedInstallment
      ? selectedInstallment.currencyCode
      : selected?.currencyCode;
  const errors = state.fieldErrors ?? {};

  function resetDocument() {
    setDocumentId("");
    setInstallmentId("");
    setAmount("");
    setFxRate("");
    setAddingInstallment(false);
  }
  async function loadProject(id: string) {
    const current = ++request.current;
    setLoading(Boolean(id));
    setOptions(null);
    setLoadError("");
    if (!id) return;
    try {
      const result = await loadReceiptEntryOptions(id);
      if (current !== request.current) return;
      setOptions(result.options);
      setLoadError(result.message);
    } catch {
      if (current === request.current)
        setLoadError("Documents could not be loaded. Please retry.");
    } finally {
      if (current === request.current) setLoading(false);
    }
  }
  if (state.status === "success")
    return (
      <div className="space-y-4">
        <p role="status">{state.message}</p>
        <Button asChild>
          <Link
            href="/payments?tab=transactions"
            onClick={() => router.refresh()}
          >
            View Transactions
          </Link>
        </Button>
        <p>
          <Link
            className="text-primary underline"
            href={supplier ? `/orders/${documentId}` : `/billing/${documentId}`}
          >
            Open {supplier ? "Order" : "Billing"}
          </Link>
        </p>
      </div>
    );

  return (
    <div className="space-y-4">
      <form className="space-y-4" onSubmit={onSubmit}>
        <fieldset
          disabled={pending}
          className="grid min-w-0 gap-4 sm:grid-cols-2"
        >
          <Field label="Type" error={errors.type}>
            <select
              name="type"
              className={inputClassName}
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                resetDocument();
              }}
            >
              <option value="SUPPLIER">Supplier payment · Cash out</option>
              <option value="CLIENT">Client receipt · Cash in</option>
            </select>
          </Field>
          <Field label="Project" required error={errors.projectId}>
            <select
              name="projectId"
              className={inputClassName}
              value={projectId}
              required
              onChange={(event) => {
                const id = event.target.value;
                setProjectId(id);
                resetDocument();
                void loadProject(id);
              }}
            >
              <option value="">Choose Project</option>
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="min-w-0 sm:col-span-2">
            <Field
              label={supplier ? "Order · Supplier" : "Billing · Client"}
              required
              error={errors.orderId ?? errors.billingDocumentId}
            >
              <select
                className={`${inputClassName} w-full`}
                name={supplier ? "orderId" : "billingDocumentId"}
                value={documentId}
                required
                disabled={loading || !options}
                onChange={(event) => {
                  resetDocument();
                  setDocumentId(event.target.value);
                }}
              >
                <option value="">
                  {loading
                    ? "Loading documents…"
                    : `Choose ${supplier ? "Order" : "Billing"}`}
                </option>
                {documents?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            {options && !documents?.length ? (
              <p className="text-muted-foreground mt-2 text-sm">
                No {supplier ? "active Orders" : "active Billing documents"} in
                this Project.
              </p>
            ) : null}
            {loadError ? (
              <div role="alert">
                <p>{loadError}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadProject(projectId)}
                >
                  Retry loading
                </Button>
              </div>
            ) : null}
          </div>
          <div className="min-w-0 sm:col-span-2">
            <Field
              label={
                supplier
                  ? "Supplier payment installment"
                  : "Billing installment (optional)"
              }
              required={supplier}
              error={errors.installmentId}
            >
              <select
                name="installmentId"
                className={`${inputClassName} w-full`}
                required={supplier}
                disabled={!selected}
                value={installmentId}
                onChange={(event) => {
                  const id = event.target.value;
                  setInstallmentId(id);
                  setAmount(
                    installments.find((item) => item.id === id)
                      ?.outstandingAmount ?? "",
                  );
                  setFxRate("");
                }}
              >
                <option value="">
                  {supplier ? "Choose installment" : "Billing level"}
                </option>
                {installments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} · {formatDateOnly(item.dueDate)} · scheduled{" "}
                    {formatMoney(
                      item.scheduledAmount,
                      "currencyCode" in item
                        ? item.currencyCode
                        : (selected?.currencyCode ?? ""),
                    )}{" "}
                    · paid{" "}
                    {formatMoney(
                      item.paidAmount,
                      "currencyCode" in item
                        ? item.currencyCode
                        : (selected?.currencyCode ?? ""),
                    )}{" "}
                    · outstanding{" "}
                    {formatMoney(
                      item.outstandingAmount,
                      "currencyCode" in item
                        ? item.currencyCode
                        : (selected?.currencyCode ?? ""),
                    )}
                  </option>
                ))}
              </select>
            </Field>
            {selectedInstallment ? (
              <p className="text-muted-foreground mt-2 text-sm">
                Outstanding:{" "}
                {formatMoney(
                  selectedInstallment.outstandingAmount,
                  currency ?? "",
                )}
                . You can enter a partial amount.
              </p>
            ) : null}
            {order ? (
              <div className="mt-2">
                <p className="text-muted-foreground text-sm">
                  Supplier payments settle an installment.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddingInstallment(!addingInstallment)}
                >
                  {addingInstallment
                    ? "Hide installment form"
                    : "Add installment"}
                </Button>
              </div>
            ) : null}
          </div>
          <Field
            label={`${supplier ? "Paid" : "Received"} amount${currency ? ` (${currency})` : ""}`}
            required
            error={errors.amount}
          >
            <MoneyInput
              name="amount"
              value={amount}
              onValueChange={setAmount}
              required
            />
          </Field>
          <Field
            label={supplier ? "Payment date" : "Receipt date"}
            required
            error={errors.settledAt ?? errors.receivedAt}
          >
            <DateInput
              name={supplier ? "settledAt" : "receivedAt"}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </Field>
          {selected && currency !== selected.reportingCurrencyCode ? (
            <Field
              label={`Actual FX to ${selected.reportingCurrencyCode}`}
              error={errors.fxRate}
              required={!supplier}
            >
              <input
                className={inputClassName}
                name="fxRate"
                inputMode="decimal"
                value={fxRate}
                onChange={(event) => setFxRate(event.target.value)}
                required={!supplier}
              />
            </Field>
          ) : null}
          <Field label="Reference" error={errors.reference}>
            <input
              className={inputClassName}
              name="reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="Notes" error={errors.notes}>
            <textarea
              className={inputClassName}
              name="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={4000}
            />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton
              pending={pending}
              disabled={!selected || loading || (supplier && !installmentId)}
            >
              Record {supplier ? "Supplier payment" : "Client receipt"}
            </SubmitButton>
          </div>
        </fieldset>
        {state.message ? (
          <p role="alert" className="text-destructive text-sm">
            {state.message}
          </p>
        ) : null}
      </form>
      {addingInstallment && order ? (
        <section className="space-y-3 border-t pt-4">
          <h3 className="font-semibold">New Supplier installment</h3>
          <InstallmentForm
            key={order.id}
            orderId={order.id}
            direction="SUPPLIER_PAYMENT"
            baseAmount={order.payable ?? "0"}
            defaultCurrencyCode={order.currencyCode}
            reportingCurrencyCode={order.reportingCurrencyCode}
            currencies={currencies}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setAddingInstallment(false);
              setInstallmentId("");
              setAmount("");
              void loadProject(projectId);
            }}
          >
            Reload installments after saving
          </Button>
        </section>
      ) : null}
    </div>
  );
}
