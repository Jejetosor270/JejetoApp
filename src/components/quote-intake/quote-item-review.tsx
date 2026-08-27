"use client";

import { useState } from "react";

import type { QuoteIntakeOptions } from "@/lib/quote-intake/options";
import type {
  ProcessedQuoteReview,
  QuoteItemReviewRow,
} from "@/lib/quote-intake/process";

const control = "border-input bg-background h-8 rounded border px-2 text-xs";

export function QuoteItemReview({
  options,
  review,
}: {
  options: QuoteIntakeOptions;
  review: NonNullable<ProcessedQuoteReview["itemReview"]>;
}) {
  const [rows, setRows] = useState(review.rows);
  const [approved, setApproved] = useState(review.rows.length > 0);
  const [selected, setSelected] = useState(() => new Set<number>());
  const update = (index: number, changes: Partial<QuoteItemReviewRow>) =>
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...changes } : row,
      ),
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
  const serializableRows = rows.map(({ warnings, ...row }) => ({
    ...row,
    warnings,
  }));
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
            {rows.length} lines · {review.itemTotalHt}{" "}
            {review.currencyCode ?? "currency unconfirmed"} · quote goods HT{" "}
            {review.orderSubtotalHt ?? "missing"}. Order financials remain
            authoritative.
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
      {review.warnings.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-800">
          {review.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {approved ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="self-center text-xs">Bulk selected:</span>
            <select
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
          <div className="mt-3 max-h-[60vh] overflow-auto rounded border">
            <table className="min-w-[90rem] text-left text-xs">
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
                  <th className="p-2">VAT rate</th>
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
                        className={`${control} w-28`}
                        defaultValue={row.itemReference ?? ""}
                        onBlur={(event) =>
                          update(index, {
                            itemReference: event.target.value || null,
                          })
                        }
                      />
                      <input
                        className={`${control} mt-1 w-28`}
                        defaultValue={row.supplierSku ?? ""}
                        onBlur={(event) =>
                          update(index, {
                            supplierSku: event.target.value || null,
                          })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <input
                        className={`${control} w-64`}
                        defaultValue={row.name}
                        onBlur={(event) =>
                          update(index, { name: event.target.value })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <select
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
                    {(
                      [
                        "quantity",
                        "unitOfMeasure",
                        "unitPriceHt",
                        "totalPriceHt",
                        "vatRate",
                      ] as const
                    ).map((field) => (
                      <td className="p-2" key={field}>
                        <input
                          className={`${control} w-24`}
                          defaultValue={row[field] ?? ""}
                          onBlur={(event) =>
                            update(index, {
                              [field]: event.target.value || null,
                            })
                          }
                        />
                      </td>
                    ))}
                    <td className="max-w-60 p-2 text-amber-800">
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
