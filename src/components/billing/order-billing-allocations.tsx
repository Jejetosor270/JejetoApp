"use client";

import Decimal from "decimal.js";
import { Plus, Trash2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { AllocationInputs } from "@/components/billing/allocation-inputs";
import { Field, inputClassName } from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/domain/procurement/presentation";

export interface OrderBillingDocumentOption {
  allocatedHt: string;
  currencyCode: string;
  fxRateToReporting: string | null;
  id: string;
  isProjectRemainderApproved: boolean;
  reference: string;
  shortDescription?: string | null;
  totalHt: string;
}

interface AllocationDraft {
  id: number;
  billingDocumentId: string;
  allocatedAmount: string;
  freightCoverageHt: string;
  otherCoverageHt: string;
  isProjectRemainderApproved: boolean;
}

/** Draft rows submit together with the Order; no allocation is saved separately. */
export function OrderBillingAllocations({
  documents,
  fieldErrors = {},
  getOrderSellHt,
  renderPreview,
}: {
  documents: OrderBillingDocumentOption[];
  fieldErrors?: Record<string, string>;
  getOrderSellHt: (document: OrderBillingDocumentOption) => string | null;
  renderPreview?:
    ((document: OrderBillingDocumentOption) => ReactNode) | undefined;
}) {
  const nextId = useRef(0);
  const [allocations, setAllocations] = useState<AllocationDraft[]>([]);
  function update(id: number, changes: Partial<AllocationDraft>) {
    setAllocations((current) =>
      current.map((row) => (row.id === id ? { ...row, ...changes } : row)),
    );
  }
  const selectedIds = new Set(allocations.map((row) => row.billingDocumentId));

  return (
    <section className="bg-card @container rounded-lg border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Billing allocations</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Optional. Link Billing from this Project. Save all allocations with
            the Order.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={allocations.length >= Math.min(documents.length, 100)}
          onClick={() => {
            const id = nextId.current++;
            setAllocations((current) => [
              ...current,
              {
                id,
                billingDocumentId: "",
                allocatedAmount: "",
                freightCoverageHt: "0",
                otherCoverageHt: "0",
                isProjectRemainderApproved: false,
              },
            ]);
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add allocation
        </Button>
      </div>
      <input
        type="hidden"
        name="billingAllocations"
        value={JSON.stringify(
          allocations.map((row) => ({
            billingDocumentId: row.billingDocumentId,
            allocatedAmount: row.allocatedAmount,
            freightCoverageHt: row.freightCoverageHt,
            otherCoverageHt: row.otherCoverageHt,
            isProjectRemainderApproved: row.isProjectRemainderApproved,
            basis: "FIXED_AMOUNT",
          })),
        )}
      />
      {fieldErrors.billingAllocations ? (
        <p role="alert" className="text-destructive mt-3 text-sm">
          {fieldErrors.billingAllocations}
        </p>
      ) : null}
      {allocations.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-xs">
          {documents.length
            ? "No allocations added. You can link Billing later."
            : "No Billing available in this Project."}
        </p>
      ) : null}
      <div className="mt-4 space-y-3">
        {allocations.map((row, index) => {
          const prefix = `billingAllocations.${index}`;
          const selected = documents.find(
            (document) => document.id === row.billingDocumentId,
          );
          const available = selected
            ? Decimal.max(
                new Decimal(selected.totalHt).minus(selected.allocatedHt),
                0,
              ).toFixed(4)
            : null;
          return (
            <fieldset className="min-w-0 rounded-md border p-3" key={row.id}>
              <legend className="px-1 text-sm font-medium">
                Allocation {index + 1}
              </legend>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1 basis-64">
                  <Field
                    label="Billing document"
                    error={fieldErrors[`${prefix}.billingDocumentId`]}
                  >
                    <select
                      className={inputClassName}
                      name={`${prefix}.billingDocumentId`}
                      aria-invalid={
                        Boolean(fieldErrors[`${prefix}.billingDocumentId`]) ||
                        undefined
                      }
                      value={row.billingDocumentId}
                      required
                      onChange={(event) => {
                        const id = event.target.value;
                        if (id !== row.billingDocumentId && selectedIds.has(id))
                          return;
                        const document = documents.find(
                          (item) => item.id === id,
                        );
                        update(row.id, {
                          billingDocumentId: id,
                          allocatedAmount: "",
                          freightCoverageHt: "0",
                          otherCoverageHt: "0",
                          isProjectRemainderApproved:
                            document?.isProjectRemainderApproved ?? false,
                        });
                      }}
                    >
                      <option value="">Choose Billing</option>
                      {documents.map((document) => (
                        <option
                          key={document.id}
                          value={document.id}
                          disabled={
                            document.id !== row.billingDocumentId &&
                            selectedIds.has(document.id)
                          }
                        >
                          {document.reference}
                          {document.shortDescription
                            ? ` · ${document.shortDescription}`
                            : ""}{" "}
                          ·{" "}
                          {formatMoney(document.totalHt, document.currencyCode)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Button
                  className="self-end"
                  type="button"
                  variant="outline"
                  aria-label={`Remove allocation ${index + 1}`}
                  onClick={() =>
                    setAllocations((current) =>
                      current.filter((item) => item.id !== row.id),
                    )
                  }
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Remove
                </Button>
              </div>
              {selected ? (
                <>
                  {renderPreview?.(selected)}
                  <div className="bg-muted/20 mt-3 grid gap-2 rounded-md border p-3 text-xs @md:grid-cols-2">
                    <p>
                      Order Sell HT:{" "}
                      {formatMoney(
                        getOrderSellHt(selected),
                        selected.currencyCode,
                      )}
                    </p>
                    <p>
                      Available HT:{" "}
                      {formatMoney(available, selected.currencyCode)}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-3 @md:grid-cols-2 @3xl:grid-cols-3">
                    <AllocationInputs
                      amount={row.allocatedAmount}
                      onAmountChange={(allocatedAmount) =>
                        update(row.id, { allocatedAmount })
                      }
                      freightCoverageHt={row.freightCoverageHt}
                      onFreightChange={(freightCoverageHt) =>
                        update(row.id, { freightCoverageHt })
                      }
                      otherCoverageHt={row.otherCoverageHt}
                      onOtherChange={(otherCoverageHt) =>
                        update(row.id, { otherCoverageHt })
                      }
                      billingTotalHt={selected.totalHt}
                      orderSellHt={getOrderSellHt(selected)}
                      currencyCode={selected.currencyCode}
                      name={`${prefix}.allocatedAmount`}
                      error={fieldErrors[`${prefix}.allocatedAmount`]}
                    />
                  </div>
                  {(["freightCoverageHt", "otherCoverageHt"] as const).map(
                    (field) =>
                      fieldErrors[`${prefix}.${field}`] ? (
                        <p
                          key={field}
                          role="alert"
                          className="text-destructive mt-2 text-xs"
                        >
                          {fieldErrors[`${prefix}.${field}`]}
                        </p>
                      ) : null,
                  )}
                  <label className="mt-3 flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      name={`${prefix}.isProjectRemainderApproved`}
                      checked={row.isProjectRemainderApproved}
                      onChange={(event) =>
                        update(row.id, {
                          isProjectRemainderApproved: event.target.checked,
                        })
                      }
                    />
                    Approve Project remainder
                  </label>
                </>
              ) : null}
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}
