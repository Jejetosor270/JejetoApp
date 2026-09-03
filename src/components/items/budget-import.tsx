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
import {
  budgetReviewColumnLabels,
  budgetReviewVisibleColumns,
  normalizeImportText,
  type BudgetReviewRow,
} from "@/domain/items/import";
import { initialQuoteSupplierCreationState } from "@/domain/quote-intake/action-state";
import { rateToPercentInput } from "@/domain/procurement/presentation";
import { humanPercentageToFraction } from "@/domain/validation/percentage";
import { PercentageInput } from "@/components/master-data/form-ui";

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
  const [rows, setRows] = useState<BudgetReviewRow[]>(() =>
    initialRows.map((row) => ({
      ...row,
      markupRate: rateToPercentInput(row.markupRate),
      vatRate: rateToPercentInput(row.vatRate),
    })),
  );
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
  const vendorGroupMap = new Map<
    string,
    { count: number; name: string; supplierIds: Set<string | null> }
  >();
  for (const row of rows) {
    const name = row.supplierName;
    const key = normalizeImportText(name);
    if (!name || !key) continue;
    const current = vendorGroupMap.get(key) ?? {
      count: 0,
      name,
      supplierIds: new Set<string | null>(),
    };
    current.count += 1;
    current.supplierIds.add(row.supplierId);
    vendorGroupMap.set(key, current);
  }
  const vendorGroups = [...vendorGroupMap].map(([key, group]) => ({
    count: group.count,
    key,
    name: group.name,
    supplierId:
      group.supplierIds.size === 1 ? ([...group.supplierIds][0] ?? null) : null,
  }));
  const resolveVendor = (key: string, supplierId: string) =>
    setRows((current) =>
      current.map((row) =>
        normalizeImportText(row.supplierName) === key
          ? {
              ...row,
              supplierId: supplierId || null,
              warnings: supplierId
                ? row.warnings.filter(
                    (warning) => !warning.startsWith("Supplier “"),
                  )
                : row.warnings,
            }
          : row,
      ),
    );
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
      {vendorGroups.length ? (
        <div className="rounded-lg border p-3">
          <p className="text-xs font-medium">Vendor resolution</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {vendorGroups.map((vendor) => (
              <label
                className="bg-muted/20 flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
                key={vendor.key}
              >
                <span>
                  {vendor.name} · {vendor.count} row
                  {vendor.count === 1 ? "" : "s"}
                </span>
                <select
                  className="border-input bg-background h-7 rounded border px-2"
                  onChange={(event) =>
                    resolveVendor(vendor.key, event.target.value)
                  }
                  value={vendor.supplierId ?? ""}
                >
                  <option value="">Unresolved</option>
                  {options.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.displayName}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      ) : null}
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
        <table className="min-w-[96rem] text-left text-xs">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              {budgetReviewVisibleColumns.map((column) => (
                <th className="p-2" key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, index) => (
              <tr key={`${row.sourceSheet}-${row.sourceRowNumber}`}>
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
                  <label className="flex items-center gap-1.5">
                    <input
                      aria-label={`Select row ${row.sourceRowNumber} for bulk editing`}
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
                    {row.action}
                  </label>
                  <span className="text-muted-foreground mt-1 block">
                    {row.matchStatus}
                  </span>
                </td>
                <td className="p-2">
                  <input
                    className={control}
                    onChange={(e) =>
                      update(index, { itemReference: e.target.value || null })
                    }
                    value={row.itemReference ?? ""}
                  />
                </td>
                <td className="p-2">
                  <input
                    className={`${control} w-60`}
                    onChange={(e) =>
                      update(index, { description: e.target.value })
                    }
                    value={row.description}
                  />
                </td>
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
                    className={`${control} w-24`}
                    onChange={(e) =>
                      update(index, { quantity: e.target.value || null })
                    }
                    value={row.quantity ?? ""}
                  />
                </td>
                <td className="p-2">
                  <input
                    className={`${control} w-20`}
                    onChange={(e) =>
                      update(index, { unitOfMeasure: e.target.value || null })
                    }
                    value={row.unitOfMeasure ?? ""}
                  />
                </td>
                {(
                  [
                    "unitPurchasePriceHt",
                    "totalPurchasePriceHt",
                    "unitSellingPriceHt",
                    "totalSellingPriceHt",
                    "markupRate",
                    "vatRate",
                  ] as const
                ).map((field) => (
                  <td className="p-2" key={field}>
                    {field === "markupRate" || field === "vatRate" ? (
                      <PercentageInput
                        className={`${control} w-28`}
                        onValueChange={(value) =>
                          update(index, { [field]: value || null })
                        }
                        value={row[field] ?? ""}
                      />
                    ) : (
                      <input
                        className={`${control} w-28`}
                        onChange={(e) =>
                          update(index, { [field]: e.target.value || null })
                        }
                        value={row[field] ?? ""}
                      />
                    )}
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
              const result = await confirmBudgetAction({
                ...payload,
                rows: rows.map((row) => ({
                  ...row,
                  markupRate: row.markupRate
                    ? (humanPercentageToFraction(row.markupRate, {
                        maximumPercent: "100",
                      }) ?? row.markupRate)
                    : null,
                  vatRate: row.vatRate
                    ? (humanPercentageToFraction(row.vatRate, {
                        maximumPercent: "100",
                      }) ?? row.vatRate)
                    : null,
                })),
              });
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
          value={currency}
        >
          <option value="">Purchase currency (required for prices)</option>
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
              {
                Object.values(state.review.mapping).filter(
                  (field) => field in budgetReviewColumnLabels,
                ).length
              }{" "}
              core columns mapped · {state.review.sheets.join(", ")}
            </summary>
            <dl className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(state.review.mapping)
                .filter(([, field]) => field in budgetReviewColumnLabels)
                .map(([header, field]) => (
                  <div key={header}>
                    <dt className="text-muted-foreground">{header}</dt>
                    <dd>
                      {budgetReviewColumnLabels[
                        field as keyof typeof budgetReviewColumnLabels
                      ] ?? field}
                      <span className="text-muted-foreground ml-1">
                        · {state.review?.mappingLevels[header]?.toLowerCase()}
                      </span>
                    </dd>
                  </div>
                ))}
            </dl>
            {state.review.ambiguousHeaders.length ? (
              <p className="mt-2 text-amber-700">
                Ambiguous: {state.review.ambiguousHeaders.join(", ")}
              </p>
            ) : null}
            {state.review.conflicts.map((conflict) => (
              <p className="mt-2 text-amber-700" key={conflict.field}>
                Conflicting columns for{" "}
                {budgetReviewColumnLabels[
                  conflict.field as keyof typeof budgetReviewColumnLabels
                ] ?? conflict.field}
                : {conflict.headers.join(", ")}
              </p>
            ))}
            {state.review.ignoredHeaderCount ||
            state.review.unmappedHeaders.length ? (
              <p className="text-muted-foreground mt-2">
                {state.review.ignoredHeaderCount} ancillary columns ignored
                {state.review.unmappedHeaders.length
                  ? `; ${state.review.unmappedHeaders.length} optional columns left unmapped`
                  : ""}
                .
              </p>
            ) : null}
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
