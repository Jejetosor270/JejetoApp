"use client";
import { RecordSectionHeading } from "@/components/layout/record-presentation";

import Decimal from "decimal.js";
import { BillingAllocationEditor } from "@/components/billing/billing-allocation-editor";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { updateOrderBillingLinkAction } from "@/app/(app)/billing/actions";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import {
  inputClassName,
  ActionFeedback,
  Field,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import type { BillingActionState } from "@/domain/billing/action-state";
import {
  fractionFromAmount,
  orderBillingCoverage,
} from "@/domain/billing/calculations";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney, formatRate } from "@/domain/procurement/presentation";
import { formatEnumLabel } from "@/domain/presentation/labels";

interface BillingLinkDocument {
  allocatedToOtherOrdersHt: string;
  availableForOrderHt: string;
  allocation: {
    allocatedAmount: string;
    freightCoverageHt?: string;
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
  const linked = documents.filter((document) => document.allocation);
  const available = documents.filter(
    (document) => !document.allocation && !document.isCancelled,
  );
  const selected = available.find((document) => document.id === selectedId);
  const coverage = orderBillingCoverage(plannedSell, invoicedAllocated);
  function allocationEditor(document: BillingLinkDocument) {
    return (
      <BillingAllocationEditor
        billing={document}
        availableHt={document.availableForOrderHt}
        orders={[
          {
            id: orderId,
            label: "This Order",
            sellingBasisHt: document.orderSellingBasisHt,
          },
        ]}
        {...(document.allocation
          ? {
              allocation: {
                orderId,
                amount: document.allocation.allocatedAmount,
                freightCoverageHt: document.allocation.freightCoverageHt ?? "0",
              },
            }
          : {})}
        onSaved={() => setSelectedId("")}
      />
    );
  }
  return (
    <section className="bg-card rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <RecordSectionHeading
          title="Linked Billing"
          description="Commercial attribution only. Client receipts remain separate cash records."
        />
        <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-right text-xs sm:grid-cols-3 xl:grid-cols-4">
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
                  {formatEnumLabel(document.status)}
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
              {canEdit ? allocationEditor(document) : null}
            </div>
            {canEdit ? (
              <EditorDrawer title="Remove allocation">
                <RemoveBillingLink document={document} orderId={orderId} />
              </EditorDrawer>
            ) : null}
          </article>
        ))}
        {linked.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No Billing Events are linked yet.
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
          {selected ? allocationEditor(selected) : null}
        </div>
      ) : null}
    </section>
  );
}
