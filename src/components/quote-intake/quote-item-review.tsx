"use client";

import { useState } from "react";

import { itemCategories, itemUnits } from "@/config/items";
import {
  quoteItemLineAmounts,
  quoteItemPercentInputToRate,
  quoteItemReviewReconciliation,
  quoteItemReviewTotal,
  quoteItemTotalFromUnit,
} from "@/domain/items/calculations";
import {
  formatMoney,
  rateToPercentInput,
} from "@/domain/procurement/presentation";
import type { QuoteIntakeOptions } from "@/lib/quote-intake/options";
import type {
  ProcessedQuoteReview,
  QuoteItemReviewRow,
} from "@/lib/quote-intake/process";

const control = "border-input bg-background h-8 rounded border px-2 text-xs";
const area =
  "border-input bg-background min-h-16 rounded border px-2 py-1.5 text-xs";
type EditableQuoteItemReviewRow = QuoteItemReviewRow & {
  vatPercentInput: string;
};

export function QuoteItemReview({
  options,
  review,
}: {
  options: QuoteIntakeOptions;
  review: NonNullable<ProcessedQuoteReview["itemReview"]>;
}) {
  const [rows, setRows] = useState<EditableQuoteItemReviewRow[]>(() =>
    review.rows.map((row) => ({
      ...row,
      vatPercentInput: rateToPercentInput(row.vatRate),
    })),
  );
  const [approved, setApproved] = useState(review.rows.length > 0);
  const [selected, setSelected] = useState(() => new Set<number>());
  const update = (
    index: number,
    changes: Partial<EditableQuoteItemReviewRow>,
  ) =>
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...changes } : row,
      ),
    );
  const updateFinancial = (
    index: number,
    field: "quantity" | "unitPriceHt",
    value: string,
  ) =>
    setRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const next = { ...row, [field]: value || null };
        const totalPriceHt = quoteItemTotalFromUnit(
          next.quantity,
          next.unitPriceHt,
        );
        return totalPriceHt ? { ...next, totalPriceHt } : next;
      }),
    );
  const bulk = (field: "buildingId" | "roomId", value: string) =>
    setRows((current) =>
      current.map((row, index) =>
        selected.has(index)
          ? {
              ...row,
              [field]: value || null,
              ...(field === "buildingId" ? { roomId: null } : {}),
            }
          : row,
      ),
    );
  const serializableRows = rows.map(
    ({ vatPercentInput, warnings, ...row }) => ({
      ...row,
      vatRate:
        vatPercentInput.trim() === ""
          ? null
          : (quoteItemPercentInputToRate(vatPercentInput) ?? vatPercentInput),
      warnings,
    }),
  );
  const liveSummary = quoteItemReviewTotal(serializableRows);
  const reconciliation = quoteItemReviewReconciliation(
    liveSummary.totalHt,
    review.orderSubtotalHt,
  );
  const extractionWarnings = review.warnings.filter(
    (warning) => !warning.startsWith("Item lines total "),
  );
  const currencyCode = review.currencyCode ?? "currency unconfirmed";
  return (
    <section className="bg-card rounded-lg border p-4 sm:p-5">
      <input name="itemExtractionModel" type="hidden" value={review.model} />
      <input
        name="itemExtractionProvider"
        type="hidden"
        value={review.provider}
      />
      <input
        name="quoteItems"
        type="hidden"
        value={JSON.stringify(serializableRows)}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Extracted quote Items</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {rows.length} lines · reviewed Items HT{" "}
            {formatMoney(liveSummary.totalHt, currencyCode)}
            {liveSummary.complete ? "" : " (incomplete)"} · quote goods HT{" "}
            {review.orderSubtotalHt
              ? formatMoney(review.orderSubtotalHt, currencyCode)
              : "missing"}
            . Order financials remain authoritative.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            checked={approved}
            name="approveItems"
            onChange={(event) => setApproved(event.target.checked)}
            type="checkbox"
          />
          Create/update reviewed Items with this Order
        </label>
      </div>
      {extractionWarnings.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-800">
          {extractionWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {reconciliation && !reconciliation.isReconciled ? (
        <p className="mt-3 text-xs text-amber-800" role="status">
          Reviewed Item lines differ from quote goods HT by{" "}
          {formatMoney(reconciliation.difference, currencyCode)}. Review
          freight, discounts, miscellaneous charges, rounding, or missing lines.
        </p>
      ) : null}
      {approved ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="self-center text-xs">Bulk selected:</span>
            <select
              aria-label="Set Building for selected Item lines"
              className={control}
              defaultValue=""
              onChange={(event) => bulk("buildingId", event.target.value)}
            >
              <option value="">Building…</option>
              {options.projects.flatMap((project) =>
                project.buildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {project.name} · {building.name}
                  </option>
                )),
              )}
            </select>
            <select
              aria-label="Set Room for selected Item lines"
              className={control}
              defaultValue=""
              onChange={(event) => bulk("roomId", event.target.value)}
            >
              <option value="">Room…</option>
              {options.projects.flatMap((project) =>
                project.buildings.flatMap((building) =>
                  building.rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {building.name} · {room.name}
                    </option>
                  )),
                ),
              )}
            </select>
          </div>
          <datalist id="quote-item-categories">
            {itemCategories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
          <datalist id="quote-item-units">
            {itemUnits.map((unit) => (
              <option key={unit} value={unit} />
            ))}
          </datalist>
          <div className="mt-3 max-h-[60vh] overflow-auto rounded border">
            <table className="min-w-[112rem] text-left text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-2">Select</th>
                  <th className="p-2">Include</th>
                  <th className="p-2">Action</th>
                  <th className="p-2">Line / SKU</th>
                  <th className="p-2">Description</th>
                  <th className="p-2">Building</th>
                  <th className="p-2">Room</th>
                  <th className="p-2">Qty</th>
                  <th className="p-2">U/M</th>
                  <th className="p-2">Unit HT</th>
                  <th className="p-2">Total HT</th>
                  <th className="p-2">VAT %</th>
                  <th className="p-2">Classification / details</th>
                  <th className="p-2">Warnings</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, index) => (
                  <tr
                    key={`${row.itemReference ?? row.supplierSku ?? "line"}-${index}`}
                  >
                    <td className="p-2">
                      <input
                        aria-label={`Select Item line ${index + 1} for bulk editing`}
                        checked={selected.has(index)}
                        onChange={() =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (next.has(index)) next.delete(index);
                            else next.add(index);
                            return next;
                          })
                        }
                        type="checkbox"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        aria-label={`Include Item line ${index + 1}`}
                        checked={row.include}
                        onChange={(event) =>
                          update(index, { include: event.target.checked })
                        }
                        type="checkbox"
                      />
                    </td>
                    <td className="p-2 font-medium">
                      {row.action}
                      {row.existingItemId ? (
                        <span className="text-muted-foreground block">
                          Matched existing
                        </span>
                      ) : null}
                    </td>
                    <td className="p-2">
                      <input
                        aria-label={`Item reference for line ${index + 1}`}
                        className={`${control} w-28`}
                        onChange={(event) =>
                          update(index, {
                            itemReference: event.target.value || null,
                          })
                        }
                        value={row.itemReference ?? ""}
                      />
                      <input
                        aria-label={`Supplier SKU for line ${index + 1}`}
                        className={`${control} mt-1 w-28`}
                        onChange={(event) =>
                          update(index, {
                            supplierSku: event.target.value || null,
                          })
                        }
                        value={row.supplierSku ?? ""}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        aria-label={`Description for line ${index + 1}`}
                        className={`${control} w-64`}
                        onChange={(event) =>
                          update(index, { name: event.target.value })
                        }
                        required={row.include}
                        value={row.name}
                      />
                    </td>
                    <td className="p-2">
                      <select
                        aria-label={`Building for line ${index + 1}`}
                        className={control}
                        value={row.buildingId ?? ""}
                        onChange={(event) =>
                          update(index, {
                            buildingId: event.target.value || null,
                            roomId: null,
                          })
                        }
                      >
                        <option value="">Unallocated</option>
                        {options.projects.flatMap((project) =>
                          project.buildings.map((building) => (
                            <option key={building.id} value={building.id}>
                              {building.name}
                            </option>
                          )),
                        )}
                      </select>
                    </td>
                    <td className="p-2">
                      <select
                        aria-label={`Room for line ${index + 1}`}
                        className={control}
                        value={row.roomId ?? ""}
                        onChange={(event) =>
                          update(index, { roomId: event.target.value || null })
                        }
                      >
                        <option value="">No Room</option>
                        {options.projects.flatMap((project) =>
                          project.buildings.flatMap((building) =>
                            building.rooms
                              .filter(
                                (room) =>
                                  !row.buildingId ||
                                  room.buildingId === row.buildingId,
                              )
                              .map((room) => (
                                <option key={room.id} value={room.id}>
                                  {room.name}
                                </option>
                              )),
                          ),
                        )}
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        aria-label={`Quantity for line ${index + 1}`}
                        className={`${control} w-20`}
                        inputMode="decimal"
                        onChange={(event) =>
                          updateFinancial(index, "quantity", event.target.value)
                        }
                        value={row.quantity ?? ""}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        aria-label={`Unit for line ${index + 1}`}
                        className={`${control} w-20`}
                        list="quote-item-units"
                        onChange={(event) =>
                          update(index, {
                            unitOfMeasure: event.target.value || null,
                          })
                        }
                        value={row.unitOfMeasure ?? ""}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        aria-label={`Unit cost HT for line ${index + 1}`}
                        className={`${control} w-24`}
                        inputMode="decimal"
                        onChange={(event) =>
                          updateFinancial(
                            index,
                            "unitPriceHt",
                            event.target.value,
                          )
                        }
                        value={row.unitPriceHt ?? ""}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        aria-label={`Total cost HT for line ${index + 1}`}
                        className={`${control} w-24`}
                        inputMode="decimal"
                        onChange={(event) =>
                          update(index, {
                            totalPriceHt: event.target.value || null,
                          })
                        }
                        value={row.totalPriceHt ?? ""}
                      />
                    </td>
                    <td className="p-2 align-top">
                      <input
                        aria-label={`VAT percentage for line ${index + 1}`}
                        className={`${control} w-20`}
                        inputMode="decimal"
                        onChange={(event) =>
                          update(index, {
                            vatPercentInput: event.target.value,
                          })
                        }
                        value={row.vatPercentInput}
                      />
                      {(() => {
                        const rate = quoteItemPercentInputToRate(
                          row.vatPercentInput,
                        );
                        const amounts = quoteItemLineAmounts({
                          totalPriceHt: row.totalPriceHt,
                          vatRate: rate,
                        });
                        return amounts.vatAmount ? (
                          <span className="text-muted-foreground mt-1 block whitespace-nowrap tabular-nums">
                            VAT {formatMoney(amounts.vatAmount, currencyCode)}
                            <br />
                            TTC {formatMoney(amounts.totalTtc, currencyCode)}
                          </span>
                        ) : null;
                      })()}
                    </td>
                    <td className="p-2 align-top">
                      <details className="min-w-48">
                        <summary className="cursor-pointer font-medium">
                          Edit details
                        </summary>
                        <div className="mt-2 grid gap-2">
                          <input
                            aria-label={`Category for line ${index + 1}`}
                            className={control}
                            list="quote-item-categories"
                            onChange={(event) =>
                              update(index, {
                                category: event.target.value || null,
                              })
                            }
                            placeholder="Category"
                            value={row.category ?? ""}
                          />
                          <input
                            aria-label={`Brand for line ${index + 1}`}
                            className={control}
                            onChange={(event) =>
                              update(index, {
                                brand: event.target.value || null,
                              })
                            }
                            placeholder="Brand"
                            value={row.brand ?? ""}
                          />
                          <input
                            aria-label={`Finish or color for line ${index + 1}`}
                            className={control}
                            onChange={(event) =>
                              update(index, {
                                finishColor: event.target.value || null,
                              })
                            }
                            placeholder="Finish / color"
                            value={row.finishColor ?? ""}
                          />
                          <textarea
                            aria-label={`Detailed description for line ${index + 1}`}
                            className={area}
                            onChange={(event) =>
                              update(index, {
                                description: event.target.value || null,
                              })
                            }
                            placeholder="Detailed description"
                            value={row.description ?? ""}
                          />
                          <textarea
                            aria-label={`Notes for line ${index + 1}`}
                            className={area}
                            onChange={(event) =>
                              update(index, {
                                notes: event.target.value || null,
                              })
                            }
                            placeholder="Notes"
                            value={row.notes ?? ""}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              aria-label={`Weight each for line ${index + 1}`}
                              className={control}
                              inputMode="decimal"
                              onChange={(event) =>
                                update(index, {
                                  weightEach: event.target.value || null,
                                })
                              }
                              placeholder="Weight each"
                              value={row.weightEach ?? ""}
                            />
                            <input
                              aria-label={`Volume each for line ${index + 1}`}
                              className={control}
                              inputMode="decimal"
                              onChange={(event) =>
                                update(index, {
                                  volumeEach: event.target.value || null,
                                })
                              }
                              placeholder="Volume each"
                              value={row.volumeEach ?? ""}
                            />
                          </div>
                        </div>
                      </details>
                    </td>
                    <td className="max-w-60 p-2 text-amber-800">
                      {row.vatPercentInput.trim() &&
                      !quoteItemPercentInputToRate(row.vatPercentInput) ? (
                        <span className="block">
                          Enter VAT as a percentage between 0 and 100.
                        </span>
                      ) : null}
                      {row.warnings.join(" ")}
                      {row.diffs.map((diff) => (
                        <span className="mt-1 block" key={diff.field}>
                          {diff.field}: {diff.before ?? "—"} →{" "}
                          {diff.after ?? "—"}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground mt-3 text-xs">
          No Item records will be persisted. The aggregate Order review can
          still be confirmed.
        </p>
      )}
    </section>
  );
}
