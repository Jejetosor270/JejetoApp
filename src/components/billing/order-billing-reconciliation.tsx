"use client";

import Decimal from "decimal.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { updateOrderBillingLinkAction } from "@/app/(app)/billing/actions";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import {
  ActionFeedback,
  Field,
  inputClassName,
  PercentageInput,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import type { BillingActionState } from "@/domain/billing/action-state";
import {
  amountFromPercentage,
  fractionFromAmount,
  orderBillingCoverage,
  percentageFromAmount,
} from "@/domain/billing/calculations";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import { humanPercentageToFraction } from "@/domain/validation/percentage";

interface BillingLinkDocument {
  allocatedToOtherOrdersHt: string;
  availableForOrderHt: string;
  allocation: {
    allocatedAmount: string;
    basis: "PERCENTAGE" | "FIXED_AMOUNT";
    percentageRate: string | null;
  } | null;
  currencyCode: string;
  documentDate: string;
  documentType: "QUOTE" | "INVOICE";
  id: string;
  isCancelled: boolean;
  isProjectRemainderApproved: boolean;
  orderSellingBasisHt: string | null;
  projectRemainder: string;
  reference: string;
  status: string;
  totalHt: string;
}

const initialState: BillingActionState = { message: "", status: "idle" };

function BillingLinkForm({
  document,
  orderId,
}: {
  document: BillingLinkDocument;
  orderId: string;
}) {
  const router = useRouter();
  const [basis, setBasis] = useState<"PERCENTAGE" | "FIXED_AMOUNT">(
    document.allocation?.basis ?? "FIXED_AMOUNT",
  );
  const [amount, setAmount] = useState(
    document.allocation?.allocatedAmount ?? "",
  );
  const [percentage, setPercentage] = useState(
    percentageFromAmount(
      document.orderSellingBasisHt ?? "",
      document.allocation?.allocatedAmount ?? "",
    ) ?? "",
  );
  const [approveRemainder, setApproveRemainder] = useState(
    document.isProjectRemainderApproved,
  );
  const { onSubmit, pending, state } = usePersistentActionState(
    updateOrderBillingLinkAction,
    initialState,
  );
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);
  return (
    <form
      className="mt-3 grid gap-3 border-t pt-3 lg:grid-cols-4"
      onSubmit={onSubmit}
    >
      <input name="billingDocumentId" type="hidden" value={document.id} />
      <input name="orderId" type="hidden" value={orderId} />
      <input name="remove" type="hidden" value="false" />
      <input
        name="percentageRate"
        type="hidden"
        value={
          basis === "PERCENTAGE"
            ? (humanPercentageToFraction(percentage, {
                maximumPercent: "100",
              }) ?? percentage)
            : ""
        }
      />
      <Field label="Basis">
        <select
          className={inputClassName}
          name="basis"
          onChange={(event) =>
            setBasis(event.target.value as "PERCENTAGE" | "FIXED_AMOUNT")
          }
          value={basis}
        >
          <option value="FIXED_AMOUNT">Amount</option>
          <option value="PERCENTAGE">Percentage</option>
        </select>
      </Field>
      <Field error={state.fieldErrors?.percentageRate} label="% of Order">
        <PercentageInput
          className={inputClassName}
          disabled={basis !== "PERCENTAGE"}
          onValueChange={(next) => {
            setPercentage(next);
            setAmount(
              amountFromPercentage(document.orderSellingBasisHt ?? "", next) ??
                "",
            );
          }}
          value={percentage}
        />
      </Field>
      <Field
        error={state.fieldErrors?.allocatedAmount}
        label={`Allocation HT (${document.currencyCode})`}
      >
        <input
          className={inputClassName}
          inputMode="decimal"
          name="allocatedAmount"
          onChange={(event) => {
            const next = event.target.value;
            setAmount(next);
            setPercentage(
              percentageFromAmount(document.orderSellingBasisHt ?? "", next) ??
                "",
            );
          }}
          value={amount}
        />
      </Field>
      <div className="flex items-end gap-2">
        <SubmitButton pending={pending}>
          {document.allocation ? "Save allocation" : "Link Billing"}
        </SubmitButton>
      </div>
      <div className="bg-muted/30 grid gap-2 rounded-md border p-3 text-xs sm:grid-cols-4 lg:col-span-4">
        <p>
          Order Sell HT:{" "}
          {formatMoney(document.orderSellingBasisHt, document.currencyCode)}
        </p>
        <p>
          Billing HT: {formatMoney(document.totalHt, document.currencyCode)}
        </p>
        <p>
          Allocated to other Orders:{" "}
          {formatMoney(
            document.allocatedToOtherOrdersHt,
            document.currencyCode,
          )}
        </p>
        <p>
          Available for this Order:{" "}
          {formatMoney(document.availableForOrderHt, document.currencyCode)}
          {document.orderSellingBasisHt ? (
            <span className="text-muted-foreground block">
              Maximum now{" "}
              {formatRate(
                fractionFromAmount(
                  document.orderSellingBasisHt,
                  Decimal.min(
                    document.availableForOrderHt,
                    document.orderSellingBasisHt,
                  ).toString(),
                ),
              )}{" "}
              of Order
            </span>
          ) : null}
        </p>
      </div>
      <label className="flex items-center gap-2 text-xs lg:col-span-3">
        <input
          checked={approveRemainder}
          name="isProjectRemainderApproved"
          onChange={(event) => setApproveRemainder(event.target.checked)}
          type="checkbox"
        />
        Approve any remaining Billing HT at Project level
      </label>
      <ActionFeedback state={state} />
    </form>
  );
}

function RemoveBillingLink({
  document,
  orderId,
}: {
  document: BillingLinkDocument;
  orderId: string;
}) {
  const router = useRouter();
  const [approveRemainder, setApproveRemainder] = useState(true);
  const { onSubmit, pending, state } = usePersistentActionState(
    updateOrderBillingLinkAction,
    initialState,
  );
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={onSubmit}
    >
      <input name="billingDocumentId" type="hidden" value={document.id} />
      <input name="orderId" type="hidden" value={orderId} />
      <input name="remove" type="hidden" value="true" />
      <label className="flex items-center gap-1 text-xs">
        <input
          checked={approveRemainder}
          name="isProjectRemainderApproved"
          onChange={(event) => setApproveRemainder(event.target.checked)}
          type="checkbox"
        />
        Keep removed amount at Project level
      </label>
      <Button disabled={pending} type="submit" variant="outline">
        Remove allocation
      </Button>
      <ActionFeedback state={state} />
    </form>
  );
}

export function OrderBillingReconciliation({
  canEdit,
  difference,
  documents,
  invoicedAllocated,
  orderId,
  plannedSell,
  quotedAllocated,
  reportingCurrencyCode,
}: {
  canEdit: boolean;
  difference: { amount: string; state: "UNBILLED" | "OVERBILLED" } | null;
  documents: BillingLinkDocument[];
  invoicedAllocated: string | null;
  orderId: string;
  plannedSell: string | null;
  quotedAllocated: string | null;
  reportingCurrencyCode: string;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const linked = documents.filter((document) => document.allocation);
  const available = documents.filter(
    (document) => !document.allocation && !document.isCancelled,
  );
  const selected = available.find((document) => document.id === selectedId);
  const coverage = orderBillingCoverage(plannedSell, invoicedAllocated);
  return (
    <section className="bg-card rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Client Billing</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Commercial attribution only. Client receipts remain separate cash
            records.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-right text-xs sm:grid-cols-3 xl:grid-cols-6">
          <p>
            Order Sell HT{" "}
            <span className="financial-figure block font-medium">
              {formatMoney(plannedSell, reportingCurrencyCode)}
            </span>
          </p>
          <p>
            Quoted{" "}
            <span className="financial-figure block font-medium">
              {formatMoney(quotedAllocated, reportingCurrencyCode)}
            </span>
          </p>
          <p>
            Allocated / invoiced HT{" "}
            <span className="financial-figure block font-medium">
              {formatMoney(invoicedAllocated, reportingCurrencyCode)}
            </span>
          </p>
          <p>
            % of Order invoiced{" "}
            <span className="financial-figure block font-medium">
              {formatRate(coverage?.coverageRate ?? null)}
            </span>
          </p>
          <p>
            {difference?.state === "OVERBILLED"
              ? "Overbilled HT"
              : "Unbilled HT"}{" "}
            <span className="financial-figure block font-medium">
              {formatMoney(difference?.amount ?? null, reportingCurrencyCode)}
            </span>
          </p>
          <p>
            Remaining %{" "}
            <span className="financial-figure block font-medium">
              {formatRate(coverage?.remainingRate ?? null)}
            </span>
          </p>
        </div>
      </div>
      {coverage && new Decimal(coverage.overallocated).greaterThan(0) ? (
        <p className="text-destructive mt-3 text-xs" role="status">
          Overbilled / overallocated by{" "}
          {formatMoney(coverage.overallocated, reportingCurrencyCode)}.
        </p>
      ) : null}
      <div className="mt-4 space-y-3">
        {linked.map((document) => (
          <article className="rounded-md border p-3" key={document.id}>
            <div className="grid gap-2 text-sm sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
              <div>
                <Link
                  className="font-medium underline"
                  href={`/billing/${document.id}`}
                >
                  {document.reference}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {document.documentType} ·{" "}
                  {formatDateOnly(document.documentDate)} ·{" "}
                  {document.status.replaceAll("_", " ")}
                </p>
              </div>
              <p className="financial-figure text-right">
                {formatMoney(
                  document.allocation?.allocatedAmount ?? null,
                  document.currencyCode,
                )}
              </p>
              <p className="financial-figure text-right">
                <span className="text-muted-foreground block text-[0.6875rem]">
                  % of Order
                </span>
                {document.allocation
                  ? formatRate(
                      fractionFromAmount(
                        document.orderSellingBasisHt ?? "",
                        document.allocation.allocatedAmount,
                      ),
                    )
                  : "—"}
              </p>
              {canEdit ? (
                <Button
                  onClick={() =>
                    setEditingId((current) =>
                      current === document.id ? null : document.id,
                    )
                  }
                  type="button"
                  variant="outline"
                >
                  Edit Allocation
                </Button>
              ) : null}
            </div>
            {canEdit && editingId === document.id ? (
              <>
                <BillingLinkForm document={document} orderId={orderId} />
                <RemoveBillingLink document={document} orderId={orderId} />
              </>
            ) : null}
          </article>
        ))}
        {linked.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No Client Billing Events are linked yet.
          </p>
        ) : null}
      </div>
      {canEdit && available.length ? (
        <div className="mt-4 rounded-md border p-3">
          <Field label="Link an existing Project Billing Event">
            <select
              className={inputClassName}
              onChange={(event) => setSelectedId(event.target.value)}
              value={selectedId}
            >
              <option value="">Choose Billing Event</option>
              {available.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.reference} · {document.documentType} ·{" "}
                  {formatMoney(document.totalHt, document.currencyCode)}
                </option>
              ))}
            </select>
          </Field>
          {selected ? (
            <BillingLinkForm document={selected} orderId={orderId} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
