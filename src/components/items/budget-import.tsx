"use client";

import { useActionState, useState, useTransition } from "react";

import {
  analyzeBudgetAction,
  confirmBudgetAction,
} from "@/app/(app)/items/import/actions";
import type { BudgetImportActionState } from "@/domain/items/action-state";
import { createRoomAction } from "@/app/(app)/items/actions";
import { createQuoteSupplierAction } from "@/app/(app)/orders/import/actions";
import { ACCEPTED_BUDGET_FILE_TYPES } from "@/config/item-extraction";
import type { BudgetReviewRow } from "@/domain/items/import";
import { initialQuoteSupplierCreationState } from "@/domain/quote-intake/action-state";

type Options = Awaited<
  ReturnType<typeof import("@/lib/items/items").listItemOptions>
>;
const initial: BudgetImportActionState = {};
const control = "border-input bg-background h-9 rounded-lg border px-3 text-sm";

function InlineImportMasterData({
  options,
  projectId,
}: {
  options: Options;
  projectId: string;
}) {
  const [roomState, roomAction, roomPending] = useActionState(
    createRoomAction,
    { message: "", status: "idle" as const },
  );
  const [supplierState, supplierAction, supplierPending] = useActionState(
    createQuoteSupplierAction,
    initialQuoteSupplierCreationState,
  );
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Create Room for reviewed rows
        </summary>
        <form action={roomAction} className="mt-3 grid gap-2 sm:grid-cols-3">
          <select className={control} name="buildingId" required>
            <option value="">Building *</option>
            {options.projects
              .find((project) => project.id === projectId)
              ?.buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name}
                </option>
              ))}
          </select>
          <input
            className={control}
            name="name"
            placeholder="Room name *"
            required
          />
          <input
            className={control}
            name="code"
            placeholder="Code (optional)"
          />
          <button
            className="bg-primary text-primary-foreground h-9 rounded-lg px-3 text-sm disabled:opacity-50"
            disabled={roomPending}
            type="submit"
          >
            {roomPending ? "Creating…" : "Create Room"}
          </button>
          {roomState.message ? (
            <p className="text-xs sm:col-span-2">{roomState.message}</p>
          ) : null}
        </form>
      </details>
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Create Supplier for reviewed rows
        </summary>
        <form
          action={supplierAction}
          className="mt-3 grid gap-2 sm:grid-cols-2"
        >
          <input
            className={control}
            name="displayName"
            placeholder="Display name *"
            required
          />
          <input
            className={control}
            name="legalName"
            placeholder="Legal name *"
            required
          />
          <select className={control} name="defaultCurrencyCode" required>
            <option value="">Currency *</option>
            {options.currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code}
              </option>
            ))}
          </select>
          <button
            className="bg-primary text-primary-foreground h-9 rounded-lg px-3 text-sm disabled:opacity-50"
            disabled={supplierPending}
            type="submit"
          >
            {supplierPending ? "Creating…" : "Create Supplier"}
          </button>
          {supplierState.message ? (
            <p className="text-xs sm:col-span-2">{supplierState.message}</p>
          ) : null}
        </form>
      </details>
    </div>
  );
}

function ReviewGrid({
  initialRows,
  options,
  payload,
}: {
  initialRows: BudgetReviewRow[];
  options: Options;
  payload: Omit<
    import("@/domain/items/import").ConfirmBudgetImportInput,
    "rows"
  >;
}) {
  const [rows, setRows] = useState(initialRows);
  const [selected, setSelected] = useState(() => new Set<number>());
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const update = (index: number, changes: Partial<BudgetReviewRow>) =>
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...changes } : row,
      ),
    );
  const bulk = (
    field: "buildingId" | "roomId" | "supplierId" | "category",
    value: string,
  ) =>
    setRows((current) =>
      current.map((row, index) =>
        selected.has(index) ? { ...row, [field]: value || null } : row,
      ),
    );
  const summary = {
    creates: rows.filter((row) => row.include && row.action === "CREATE")
      .length,
    updates: rows.filter((row) => row.include && row.action === "UPDATE")
      .length,
    skipped: rows.filter((row) => !row.include || row.action === "SKIP").length,
    warnings: rows.reduce((sum, row) => sum + row.warnings.length, 0),
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-4">
        {Object.entries(summary).map(([label, value]) => (
          <div className="rounded-lg border p-3" key={label}>
            <p className="text-muted-foreground text-xs capitalize">{label}</p>
            <p className="text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="bg-muted/20 flex flex-wrap gap-2 rounded-lg border p-3">
        <span className="self-center text-xs font-medium">
          Bulk edit selected:
        </span>
        <select
          className={control}
          defaultValue=""
          onChange={(e) => bulk("supplierId", e.target.value)}
        >
          <option value="">Supplier…</option>
          {options.suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
        <select
          className={control}
          defaultValue=""
          onChange={(e) => bulk("buildingId", e.target.value)}
        >
          <option value="">Building…</option>
          {options.projects.flatMap((p) =>
            p.buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {p.name} · {b.name}
              </option>
            )),
          )}
        </select>
        <select
          className={control}
          defaultValue=""
          onChange={(e) => bulk("roomId", e.target.value)}
        >
          <option value="">Room…</option>
          {options.projects.flatMap((p) =>
            p.buildings.flatMap((b) =>
              b.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {b.name} · {r.name}
                </option>
              )),
            ),
          )}
        </select>
        <input
          className={control}
          placeholder="Category then Enter"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              bulk("category", e.currentTarget.value);
            }
          }}
        />
      </div>
      <div className="max-h-[65vh] overflow-auto rounded-lg border">
        <table className="min-w-[110rem] text-left text-xs">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th className="p-2">Select</th>
              <th className="p-2">Include</th>
              <th className="p-2">Match / action</th>
              <th className="p-2">Reference</th>
              <th className="p-2">Description</th>
              <th className="p-2">Brand</th>
              <th className="p-2">Finish</th>
              <th className="p-2">Supplier</th>
              <th className="p-2">Building</th>
              <th className="p-2">Room</th>
              <th className="p-2">Category</th>
              <th className="p-2">Qty</th>
              <th className="p-2">U/M</th>
              <th className="p-2">Unit purchase HT</th>
              <th className="p-2">Total purchase HT</th>
              <th className="p-2">Markup rate</th>
              <th className="p-2">Selling HT</th>
              <th className="p-2">VAT amount</th>
              <th className="p-2">VAT rate</th>
              <th className="p-2">Warnings / differences</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, index) => (
              <tr key={`${row.sourceSheet}-${row.sourceRowNumber}`}>
                <td className="p-2">
                  <input
                    aria-label={`Select row ${row.sourceRowNumber}`}
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
                    onChange={(e) =>
                      update(index, {
                        include: e.target.checked,
                        action: e.target.checked
                          ? row.existingItemId
                            ? "UPDATE"
                            : "CREATE"
                          : "SKIP",
                      })
                    }
                    type="checkbox"
                  />
                </td>
                <td className="p-2 font-medium">
                  {row.matchStatus}
                  <span className="text-muted-foreground block">
                    {row.action}
                  </span>
                </td>
                <td className="p-2">
                  <input
                    className={control}
                    defaultValue={row.itemReference ?? ""}
                    onBlur={(e) =>
                      update(index, { itemReference: e.target.value || null })
                    }
                  />
                </td>
                <td className="p-2">
                  <input
                    className={`${control} w-60`}
                    defaultValue={row.description}
                    onBlur={(e) =>
                      update(index, { description: e.target.value })
                    }
                  />
                </td>
                {(["brand", "finishColor"] as const).map((field) => (
                  <td className="p-2" key={field}>
                    <input
                      className={`${control} w-32`}
                      defaultValue={row[field] ?? ""}
                      onBlur={(e) =>
                        update(index, { [field]: e.target.value || null })
                      }
                    />
                  </td>
                ))}
                <td className="p-2">
                  <select
                    className={control}
                    value={row.supplierId ?? ""}
                    onChange={(e) =>
                      update(index, { supplierId: e.target.value || null })
                    }
                  >
                    <option value="">None</option>
                    {options.suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.displayName}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  <select
                    className={control}
                    value={row.buildingId ?? ""}
                    onChange={(e) =>
                      update(index, {
                        buildingId: e.target.value || null,
                        roomId: null,
                      })
                    }
                  >
                    <option value="">None</option>
                    {options.projects.flatMap((p) =>
                      p.buildings.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      )),
                    )}
                  </select>
                </td>
                <td className="p-2">
                  <select
                    className={control}
                    value={row.roomId ?? ""}
                    onChange={(e) =>
                      update(index, { roomId: e.target.value || null })
                    }
                  >
                    <option value="">None</option>
                    {options.projects.flatMap((p) =>
                      p.buildings.flatMap((b) =>
                        b.rooms
                          .filter(
                            (r) =>
                              !row.buildingId ||
                              r.buildingId === row.buildingId,
                          )
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          )),
                      ),
                    )}
                  </select>
                </td>
                <td className="p-2">
                  <input
                    className={control}
                    defaultValue={row.category ?? ""}
                    onBlur={(e) =>
                      update(index, { category: e.target.value || null })
                    }
                  />
                </td>
                <td className="p-2">
                  <input
                    className={`${control} w-24`}
                    defaultValue={row.quantity ?? ""}
                    onBlur={(e) =>
                      update(index, { quantity: e.target.value || null })
                    }
                  />
                </td>
                <td className="p-2">
                  <input
                    className={`${control} w-20`}
                    defaultValue={row.unitOfMeasure ?? ""}
                    onBlur={(e) =>
                      update(index, { unitOfMeasure: e.target.value || null })
                    }
                  />
                </td>
                {(
                  [
                    "unitPurchasePriceHt",
                    "totalPurchasePriceHt",
                    "markupRate",
                    "totalSellingPriceHt",
                    "vatAmount",
                    "vatRate",
                  ] as const
                ).map((field) => (
                  <td className="p-2" key={field}>
                    <input
                      className={`${control} w-28`}
                      defaultValue={row[field] ?? ""}
                      onBlur={(e) =>
                        update(index, { [field]: e.target.value || null })
                      }
                    />
                  </td>
                ))}
                <td className="max-w-80 p-2">
                  <span className="text-amber-700">
                    {row.warnings.join(" ")}
                  </span>
                  {row.diffs.map((diff) => (
                    <span className="mt-1 block" key={diff.field}>
                      {diff.field}: {diff.before ?? "—"} → {diff.after ?? "—"}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button
          className="bg-primary text-primary-foreground h-9 rounded-lg px-4 text-sm font-medium disabled:opacity-50"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await confirmBudgetAction({ ...payload, rows });
              setFeedback(result.message ?? "");
            })
          }
          type="button"
        >
          {pending
            ? "Importing…"
            : `Confirm ${summary.creates + summary.updates} Items`}
        </button>
        {feedback ? (
          <p className="text-sm" role="status">
            {feedback}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function BudgetImport({ options }: { options: Options }) {
  const [state, action, pending] = useActionState(analyzeBudgetAction, initial);
  const [projectId, setProjectId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [currency, setCurrency] = useState("");
  return (
    <div className="space-y-5">
      <form
        action={action}
        className="grid gap-3 rounded-lg border p-4 md:grid-cols-2 xl:grid-cols-5"
      >
        <select
          className={control}
          name="projectId"
          onChange={(e) => {
            setProjectId(e.target.value);
            const project = options.projects.find(
              (p) => p.id === e.target.value,
            );
            setCurrency(project?.reportingCurrencyCode ?? "");
            setBuildingId("");
          }}
          required
          value={projectId}
        >
          <option value="">Project *</option>
          {options.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className={control}
          name="defaultBuildingId"
          onChange={(e) => setBuildingId(e.target.value)}
          value={buildingId}
        >
          <option value="">Default Building (optional)</option>
          {options.projects
            .find((p) => p.id === projectId)
            ?.buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </select>
        <select
          className={control}
          name="defaultSupplierId"
          onChange={(e) => setSupplierId(e.target.value)}
          value={supplierId}
        >
          <option value="">Default Supplier (optional)</option>
          {options.suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
        <select
          className={control}
          name="purchaseCurrencyCode"
          onChange={(e) => setCurrency(e.target.value)}
          required
          value={currency}
        >
          <option value="">Purchase currency *</option>
          {options.currencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}
            </option>
          ))}
        </select>
        <input
          accept={ACCEPTED_BUDGET_FILE_TYPES}
          className={control}
          name="budgetFile"
          required
          type="file"
        />
        <label className="flex items-center gap-2 text-xs">
          <input name="useAiMapping" type="checkbox" />
          AI-map ambiguous columns
        </label>
        <button
          className="bg-primary text-primary-foreground h-9 rounded-lg px-4 text-sm font-medium disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {pending ? "Parsing…" : "Parse workbook"}
        </button>
        <p className="text-muted-foreground text-xs md:col-span-4">
          XLSX only, up to 500 Item rows and 4 MB. The file is processed in this
          request and discarded.
        </p>
      </form>
      {state.message ? (
        <p
          className={
            state.status === "error" ? "text-destructive text-sm" : "text-sm"
          }
          role="status"
        >
          {state.message}
        </p>
      ) : null}
      {state.review ? (
        <>
          <InlineImportMasterData
            options={options}
            projectId={state.review.projectId}
          />
          <details className="rounded-lg border p-3 text-xs">
            <summary className="cursor-pointer font-medium">
              Detected mapping · {state.review.sheets.join(", ")}
            </summary>
            <dl className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(state.review.mapping).map(([header, field]) => (
                <div key={header}>
                  <dt className="text-muted-foreground">{header}</dt>
                  <dd>{field}</dd>
                </div>
              ))}
            </dl>
          </details>
          <ReviewGrid
            initialRows={state.review.rows}
            options={options}
            payload={{
              defaultBuildingId: state.review.defaultBuildingId,
              defaultSupplierId: state.review.defaultSupplierId,
              extractionModel: state.review.extractionModel,
              extractionProvider: state.review.extractionProvider,
              filename: state.review.filename,
              mapping: state.review.mapping,
              projectId: state.review.projectId,
            }}
          />
        </>
      ) : null}
    </div>
  );
}
