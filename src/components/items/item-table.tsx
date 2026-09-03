"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  bulkUpdateItemsAction,
  deleteSelectedItemsAction,
  updateItemFinancialInlineAction,
  updateItemGeneralInlineAction,
  updateItemStatusInlineAction,
  updateItemTrackingInlineAction,
} from "@/app/(app)/items/actions";
import {
  BulkActionBar,
  SelectionCell,
  SelectionHeader,
  useBulkSelection,
} from "@/components/bulk-actions/bulk-selection";
import {
  InlineDateInput,
  InlineEditActions,
  InlineMoneyInput,
  InlinePercentInput,
  InlineSelect,
  InlineTextInput,
} from "@/components/inline-editing/inline-edit";
import { vatRecoverabilities, vatTreatments } from "@/config/vat";
import {
  itemBudgetVariance,
  projectFreightEstimate,
  quoteItemPercentInputToRate,
  reconcileItemFinancialDraft,
  type ItemFinancialEditBasis,
} from "@/domain/items/calculations";
import {
  formatMoney,
  formatQuantity,
  rateToPercentInput,
} from "@/domain/procurement/presentation";
import { itemCommercialStatuses, itemLogisticsStatuses } from "@/config/items";
import type { ManagedItem } from "@/lib/items/items";
import { itemViewColumns } from "@/config/item-views";
import { inputVatRecoverabilityApplies } from "@/domain/vat/recoverability";
import {
  dateOnlyToEuropeanInput,
  europeanInputToDateOnly,
} from "@/domain/payments/dates";

type Options = Awaited<
  ReturnType<typeof import("@/lib/items/items").listItemOptions>
>;
export type ItemViewMode = "general" | "financial" | "status" | "tracking";

const control =
  "border-input bg-background h-8 rounded border px-2 text-xs disabled:opacity-60";
const saveButton =
  "bg-primary text-primary-foreground h-8 rounded px-2 text-xs font-medium disabled:opacity-50";

function ItemIdentity({ item }: { item: ManagedItem }) {
  return (
    <td className="max-w-64 px-3 py-2">
      <Link className="font-medium hover:underline" href={`/items/${item.id}`}>
        {item.itemReference || "—"}
      </Link>
      <span className="text-muted-foreground block truncate">{item.name}</span>
    </td>
  );
}

function FinancialRow({
  canEdit,
  item,
}: {
  canEdit: boolean;
  item: ManagedItem;
}) {
  const initialDraft = () => ({
    budgetTotal: item.totalSellingPriceHt ?? "",
    budgetUnit: item.unitSellingPriceHt ?? "",
    budgetVarianceComment: item.budgetVarianceComment ?? "",
    markupPercent: rateToPercentInput(item.financial.markupRate),
    quantity: item.quantity,
    totalPurchase: item.totalPurchasePriceHt ?? "",
    unitPurchase: item.unitPurchasePriceHt ?? "",
    vatRate: rateToPercentInput(item.vatRate),
    vatRecoverability: item.vatRecoverability ?? "",
    vatTreatment: item.vatTreatment ?? "",
  });
  const [saved, setSaved] = useState(initialDraft);
  const [draft, setDraft] = useState(initialDraft);
  const [editing, setEditing] = useState(false);
  const [basis, setBasis] = useState<ItemFinancialEditBasis>("BUDGET_UNIT");
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const updateFinancial = (
    nextBasis: ItemFinancialEditBasis,
    field: keyof typeof draft,
    value: string,
  ) => {
    const next = { ...draft, [field]: value };
    const nextMarkupRate =
      next.markupPercent.trim() === ""
        ? null
        : quoteItemPercentInputToRate(next.markupPercent);
    if (nextBasis === "MARKUP" && nextMarkupRate === null) {
      setDraft(next);
      return;
    }
    setBasis(nextBasis);
    try {
      const reconciled = reconcileItemFinancialDraft({
        basis: nextBasis,
        budgetTotal: next.budgetTotal || null,
        budgetUnit: next.budgetUnit || null,
        markupRate: nextMarkupRate,
        quantity: next.quantity,
        totalPurchase: next.totalPurchase || null,
        unitPurchase: next.unitPurchase || null,
      });
      setDraft({
        ...next,
        budgetTotal: reconciled.budgetTotal ?? "",
        budgetUnit: reconciled.budgetUnit ?? "",
        markupPercent: rateToPercentInput(reconciled.markupRate),
        quantity: reconciled.quantity,
        totalPurchase: reconciled.totalPurchase ?? "",
        unitPurchase: reconciled.unitPurchase ?? "",
      });
    } catch {
      setDraft(next);
    }
  };
  const variance = itemBudgetVariance(
    item.budgetPurchaseTotalPriceHt,
    draft.totalPurchase || null,
  );
  const currency =
    item.purchaseCurrencyCode ?? item.project.reportingCurrencyCode;
  const shippingAllowance = projectFreightEstimate(
    item.totalSellingPriceHt ?? "0",
    item.project.freightEstimateRate,
  );
  const moneyInput = (
    label: string,
    field: keyof typeof draft,
    nextBasis: ItemFinancialEditBasis,
  ) => (
    <input
      aria-label={`${label} for ${item.itemReference ?? item.name}`}
      className={`${control} w-24 text-right tabular-nums`}
      disabled={!editing}
      inputMode="decimal"
      onChange={(event) =>
        updateFinancial(nextBasis, field, event.target.value)
      }
      value={draft[field]}
    />
  );
  return (
    <tr className="hover:bg-muted/25 align-top">
      <ItemIdentity item={item} />
      <td className="p-2">
        {moneyInput("Quantity", "quantity", "QUANTITY")}
        <span className="text-muted-foreground ml-1">{item.unitOfMeasure}</span>
      </td>
      <td className="p-2">
        {moneyInput("Unit purchase HT", "unitPurchase", "UNIT_PURCHASE")}
      </td>
      <td className="p-2">
        {moneyInput("Purchase total HT", "totalPurchase", "TOTAL_PURCHASE")}
      </td>
      <td className="p-2">
        {moneyInput("Budget unit HT", "budgetUnit", "BUDGET_UNIT")}
      </td>
      <td className="p-2">
        {moneyInput("Budget total HT", "budgetTotal", "BUDGET_TOTAL")}
      </td>
      <td className="p-2">
        <InlinePercentInput
          ariaLabel={`Markup percentage for ${item.itemReference ?? item.name}`}
          disabled={!editing}
          onChange={(value) =>
            updateFinancial("MARKUP", "markupPercent", value)
          }
          value={draft.markupPercent}
        />
      </td>
      <td className="p-2">
        <select
          aria-label={`VAT treatment for ${item.itemReference ?? item.name}`}
          className={control}
          disabled={!editing}
          onChange={(event) =>
            setDraft((current) => {
              const vatTreatment = event.target.value;
              return {
                ...current,
                vatRecoverability: inputVatRecoverabilityApplies(vatTreatment)
                  ? current.vatRecoverability
                  : "",
                vatTreatment,
              };
            })
          }
          value={draft.vatTreatment}
        >
          <option value="">—</option>
          {vatTreatments.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <InlinePercentInput
          ariaLabel={`VAT percentage for ${item.itemReference ?? item.name}`}
          disabled={!editing}
          onChange={(value) =>
            setDraft((current) => ({ ...current, vatRate: value }))
          }
          value={draft.vatRate}
        />
      </td>
      <td className="p-2">
        {inputVatRecoverabilityApplies(draft.vatTreatment) ? (
          <select
            aria-label={`VAT recoverability for ${item.itemReference ?? item.name}`}
            className={control}
            disabled={!editing}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                vatRecoverability: event.target.value,
              }))
            }
            value={draft.vatRecoverability}
          >
            <option value="">—</option>
            {vatRecoverabilities.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        ) : (
          "—"
        )}
      </td>
      <td className="p-2 tabular-nums">
        {item.budgetPurchaseTotalPriceHt ? (
          <>
            <span className="block">
              Baseline {formatMoney(item.budgetPurchaseTotalPriceHt, currency)}
            </span>
            <span
              className={
                variance?.status === "OVER_BUDGET"
                  ? "text-destructive"
                  : "text-positive"
              }
            >
              {variance
                ? `${formatMoney(variance.amount, currency)} ${variance.status
                    .replace("_BUDGET", "")
                    .toLowerCase()} budget`
                : "—"}
            </span>
          </>
        ) : (
          "No purchase baseline"
        )}
      </td>
      <td className="p-2">
        <input
          aria-label={`Variance comment for ${item.itemReference ?? item.name}`}
          className={`${control} w-52`}
          disabled={!editing}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              budgetVarianceComment: event.target.value,
            }))
          }
          value={draft.budgetVarianceComment}
        />
      </td>
      <td className="p-2 text-right tabular-nums">
        {shippingAllowance ? formatMoney(shippingAllowance, currency) : "—"}
      </td>
      {canEdit ? (
        <td className="p-2">
          <InlineEditActions
            editing={editing}
            feedback={feedback}
            onCancel={() => {
              setDraft(saved);
              setFeedback("");
              setEditing(false);
            }}
            onEdit={() => {
              setDraft(saved);
              setFeedback("");
              setEditing(true);
            }}
            onSave={() => {
              const data = new FormData();
              data.set("id", item.id);
              data.set("basis", basis);
              data.set("quantity", draft.quantity);
              data.set("unitPurchase", draft.unitPurchase);
              data.set("totalPurchase", draft.totalPurchase);
              data.set("budgetUnit", draft.budgetUnit);
              data.set("budgetTotal", draft.budgetTotal);
              data.set("markupRate", draft.markupPercent);
              data.set("budgetVarianceComment", draft.budgetVarianceComment);
              data.set("vatRate", draft.vatRate);
              data.set("vatRecoverability", draft.vatRecoverability);
              data.set("vatTreatment", draft.vatTreatment);
              startTransition(async () => {
                const result = await updateItemFinancialInlineAction(data);
                setFeedback(result.message);
                if (result.status === "success" && result.values) {
                  const next = {
                    ...draft,
                    budgetTotal: result.values.budgetTotal ?? "",
                    budgetUnit: result.values.budgetUnit ?? "",
                    markupPercent: rateToPercentInput(result.values.markupRate),
                    quantity: result.values.quantity,
                    totalPurchase: result.values.totalPurchase ?? "",
                    unitPurchase: result.values.unitPurchase ?? "",
                    vatRate: rateToPercentInput(result.values.vatRate),
                    vatRecoverability: result.values.vatRecoverability ?? "",
                    vatTreatment: result.values.vatTreatment ?? "",
                  };
                  setSaved(next);
                  setDraft(next);
                  setEditing(false);
                }
              });
            }}
            pending={pending}
          />
        </td>
      ) : null}
    </tr>
  );
}

function StatusRow({ canEdit, item }: { canEdit: boolean; item: ManagedItem }) {
  const [saved, setSaved] = useState({
    commercialStatus: item.commercialStatus,
    logisticsStatus: item.logisticsStatus,
  });
  const [commercialStatus, setCommercialStatus] = useState(
    item.commercialStatus,
  );
  const [logisticsStatus, setLogisticsStatus] = useState(item.logisticsStatus);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <tr className="hover:bg-muted/25">
      <ItemIdentity item={item} />
      <td className="px-3 py-2">{item.supplier?.displayName ?? "—"}</td>
      <td className="px-3 py-2">
        <select
          className={control}
          disabled={!editing}
          onChange={(event) =>
            setCommercialStatus(
              event.target.value as (typeof itemCommercialStatuses)[number],
            )
          }
          value={commercialStatus}
        >
          {itemCommercialStatuses.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          className={control}
          disabled={!editing}
          onChange={(event) =>
            setLogisticsStatus(
              event.target.value as (typeof itemLogisticsStatuses)[number],
            )
          }
          value={logisticsStatus}
        >
          {itemLogisticsStatuses.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 font-medium">
        {item.vendorPaymentStatus.replaceAll("_", " ")}
      </td>
      {canEdit ? (
        <td className="px-3 py-2">
          <InlineEditActions
            editing={editing}
            feedback={feedback}
            onCancel={() => {
              setCommercialStatus(saved.commercialStatus);
              setLogisticsStatus(saved.logisticsStatus);
              setFeedback("");
              setEditing(false);
            }}
            onEdit={() => {
              setCommercialStatus(saved.commercialStatus);
              setLogisticsStatus(saved.logisticsStatus);
              setFeedback("");
              setEditing(true);
            }}
            onSave={() => {
              const data = new FormData();
              data.set("id", item.id);
              data.set("commercialStatus", commercialStatus);
              data.set("logisticsStatus", logisticsStatus);
              startTransition(async () => {
                const result = await updateItemStatusInlineAction(data);
                setFeedback(result.message);
                if (result.status === "success") {
                  setSaved({ commercialStatus, logisticsStatus });
                  setEditing(false);
                }
              });
            }}
            pending={pending}
          />
        </td>
      ) : null}
    </tr>
  );
}

function TrackingRow({
  canEdit,
  item,
  options,
}: {
  canEdit: boolean;
  item: ManagedItem;
  options: Options;
}) {
  const initialDraft = () => ({
    deliveredResidenceDate: dateOnlyToEuropeanInput(
      item.deliveredResidenceDate,
    ),
    estimatedFabricatorDate: dateOnlyToEuropeanInput(
      item.estimatedFabricatorDate,
    ),
    estimatedResidenceDate: dateOnlyToEuropeanInput(
      item.estimatedResidenceDate,
    ),
    estimatedWarehouseDate: dateOnlyToEuropeanInput(
      item.estimatedWarehouseDate,
    ),
    expectedWarehouseId: item.expectedWarehouseId ?? "",
    fabricatorId: item.fabricatorId ?? "",
    inTransitDate: dateOnlyToEuropeanInput(item.inTransitDate),
    installedDate: dateOnlyToEuropeanInput(item.installedDate),
    logisticsStatus: item.logisticsStatus,
    receivedFabricatorDate: dateOnlyToEuropeanInput(
      item.receivedFabricatorDate,
    ),
    receivedWarehouseDate: dateOnlyToEuropeanInput(item.receivedWarehouseDate),
    receivedWarehouseId: item.receivedWarehouseId ?? "",
  });
  const [saved, setSaved] = useState(initialDraft);
  const [draft, setDraft] = useState(initialDraft);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const set = (field: keyof typeof draft, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const locations = (type: "WAREHOUSE" | "FABRICATOR") =>
    options.locations.filter((location) => location.type === type);
  return (
    <tr className="hover:bg-muted/25 align-top">
      <ItemIdentity item={item} />
      <td className="p-2">{item.supplier?.displayName ?? "—"}</td>
      <td className="p-2">
        <select
          className={control}
          disabled={!editing}
          onChange={(event) => set("logisticsStatus", event.target.value)}
          value={draft.logisticsStatus}
        >
          {itemLogisticsStatuses.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <select
          className={control}
          disabled={!editing}
          onChange={(event) => set("fabricatorId", event.target.value)}
          value={draft.fabricatorId}
        >
          <option value="">—</option>
          {locations("FABRICATOR").map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <select
          className={control}
          disabled={!editing}
          onChange={(event) => set("expectedWarehouseId", event.target.value)}
          value={draft.expectedWarehouseId}
        >
          <option value="">—</option>
          {locations("WAREHOUSE").map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </td>
      {(
        [
          "estimatedFabricatorDate",
          "receivedFabricatorDate",
          "estimatedWarehouseDate",
          "receivedWarehouseDate",
        ] as const
      ).map((field) => (
        <td className="p-2" key={field}>
          <InlineDateInput
            ariaLabel={`${field} for ${item.itemReference ?? item.name}`}
            className={control}
            disabled={!editing}
            onChange={(value) => set(field, value)}
            value={draft[field]}
          />
        </td>
      ))}
      <td className="p-2">
        {(
          ["inTransitDate", "deliveredResidenceDate", "installedDate"] as const
        ).map((field) => (
          <InlineDateInput
            ariaLabel={`${field} for ${item.itemReference ?? item.name}`}
            className={`${control} mb-1 block`}
            disabled={!editing}
            key={field}
            onChange={(value) => set(field, value)}
            value={draft[field]}
          />
        ))}
      </td>
      {canEdit ? (
        <td className="p-2">
          <InlineEditActions
            editing={editing}
            feedback={feedback}
            onCancel={() => {
              setDraft(saved);
              setFeedback("");
              setEditing(false);
            }}
            onEdit={() => {
              setDraft(saved);
              setFeedback("");
              setEditing(true);
            }}
            onSave={() => {
              const data = new FormData();
              const dateFields = new Set([
                "deliveredResidenceDate",
                "estimatedFabricatorDate",
                "estimatedResidenceDate",
                "estimatedWarehouseDate",
                "inTransitDate",
                "installedDate",
                "receivedFabricatorDate",
                "receivedWarehouseDate",
              ]);
              Object.entries({ ...draft, id: item.id }).forEach(
                ([key, value]) => {
                  const serverValue =
                    dateFields.has(key) && value.trim()
                      ? (europeanInputToDateOnly(value) ?? value)
                      : value;
                  data.set(key, serverValue);
                },
              );
              startTransition(async () => {
                const result = await updateItemTrackingInlineAction(data);
                setFeedback(result.message);
                if (result.status === "success") {
                  setSaved(draft);
                  setEditing(false);
                }
              });
            }}
            pending={pending}
          />
        </td>
      ) : null}
    </tr>
  );
}

function GeneralRow({
  canEdit,
  item,
  options,
  selection,
}: {
  canEdit: boolean;
  item: ManagedItem;
  options: Options;
  selection: ReturnType<typeof useBulkSelection>;
}) {
  const initial = () => ({
    buildingId: item.buildingId ?? "",
    category: item.category ?? "",
    itemReference: item.itemReference ?? "",
    name: item.name,
    quantity: item.quantity,
    roomId: item.roomId ?? "",
    supplierId: item.supplierId ?? "",
    unitOfMeasure: item.unitOfMeasure,
  });
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const project = options.projects.find(
    (candidate) => candidate.id === item.projectId,
  );
  const building = project?.buildings.find(
    (candidate) => candidate.id === draft.buildingId,
  );
  const save = () => {
    const data = new FormData();
    Object.entries({ ...draft, id: item.id }).forEach(([key, value]) =>
      data.set(key, value),
    );
    startTransition(async () => {
      const result = await updateItemGeneralInlineAction(data);
      setFeedback(result.message);
      if (result.status === "success" && result.values) {
        const next = {
          buildingId: result.values.buildingId ?? "",
          category: result.values.category ?? "",
          itemReference: result.values.itemReference ?? "",
          name: result.values.name,
          quantity: result.values.quantity,
          roomId: result.values.roomId ?? "",
          supplierId: result.values.supplierId ?? "",
          unitOfMeasure: result.values.unitOfMeasure,
        };
        setSaved(next);
        setDraft(next);
        setEditing(false);
      }
    });
  };
  return (
    <tr className="hover:bg-muted/25">
      {canEdit ? (
        <SelectionCell
          checked={selection.isSelected(item.id)}
          label={item.itemReference ?? item.name}
          onChange={() => selection.toggle(item.id)}
        />
      ) : null}
      <td className="max-w-72 px-3 py-2">
        {editing ? (
          <div className="grid gap-1">
            <InlineTextInput
              ariaLabel={`Item reference for ${saved.name}`}
              onChange={(value) =>
                setDraft((current) => ({ ...current, itemReference: value }))
              }
              value={draft.itemReference}
            />
            <InlineTextInput
              ariaLabel={`Description for ${saved.itemReference || saved.name}`}
              className="w-64"
              onChange={(value) =>
                setDraft((current) => ({ ...current, name: value }))
              }
              value={draft.name}
            />
          </div>
        ) : (
          <>
            <Link
              className="font-medium hover:underline"
              href={`/items/${item.id}`}
            >
              {saved.itemReference || "—"}
            </Link>
            <span className="text-muted-foreground block truncate">
              {saved.name}
            </span>
          </>
        )}
      </td>
      <td className="px-3 py-2">{item.project.name}</td>
      <td className="px-3 py-2">
        {editing ? (
          <InlineSelect
            ariaLabel={`Building for ${saved.itemReference || saved.name}`}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                buildingId: value,
                roomId: "",
              }))
            }
            value={draft.buildingId}
          >
            <option value="">Unallocated</option>
            {project?.buildings.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </InlineSelect>
        ) : (
          (project?.buildings.find(
            (candidate) => candidate.id === saved.buildingId,
          )?.name ?? "Unallocated")
        )}
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <InlineSelect
            ariaLabel={`Room for ${saved.itemReference || saved.name}`}
            disabled={!draft.buildingId}
            onChange={(value) =>
              setDraft((current) => ({ ...current, roomId: value }))
            }
            value={draft.roomId}
          >
            <option value="">—</option>
            {building?.rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </InlineSelect>
        ) : (
          (project?.buildings
            .flatMap((candidate) => candidate.rooms)
            .find((room) => room.id === saved.roomId)?.name ?? "—")
        )}
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <InlineSelect
            ariaLabel={`Supplier for ${saved.itemReference || saved.name}`}
            onChange={(value) =>
              setDraft((current) => ({ ...current, supplierId: value }))
            }
            value={draft.supplierId}
          >
            <option value="">—</option>
            {options.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.displayName}
              </option>
            ))}
          </InlineSelect>
        ) : (
          (options.suppliers.find(
            (supplier) => supplier.id === saved.supplierId,
          )?.displayName ?? "—")
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {editing ? (
          <span className="flex gap-1">
            <InlineMoneyInput
              ariaLabel={`Quantity for ${saved.itemReference || saved.name}`}
              className="w-20"
              onChange={(value) =>
                setDraft((current) => ({ ...current, quantity: value }))
              }
              value={draft.quantity}
            />
            <InlineTextInput
              ariaLabel={`Unit for ${saved.itemReference || saved.name}`}
              className="w-16"
              onChange={(value) =>
                setDraft((current) => ({ ...current, unitOfMeasure: value }))
              }
              value={draft.unitOfMeasure}
            />
          </span>
        ) : (
          `${formatQuantity(saved.quantity)} ${saved.unitOfMeasure}`
        )}
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <InlineTextInput
            ariaLabel={`Category for ${saved.itemReference || saved.name}`}
            onChange={(value) =>
              setDraft((current) => ({ ...current, category: value }))
            }
            value={draft.category}
          />
        ) : (
          saved.category || "—"
        )}
      </td>
      <td className="px-3 py-2">{item.updatedAt.toISOString().slice(0, 10)}</td>
      {canEdit ? (
        <td className="px-3 py-2">
          <InlineEditActions
            editing={editing}
            feedback={feedback}
            onCancel={() => {
              setDraft(saved);
              setFeedback("");
              setEditing(false);
            }}
            onEdit={() => {
              setDraft(saved);
              setFeedback("");
              setEditing(true);
            }}
            onSave={save}
            pending={pending}
          />
        </td>
      ) : null}
    </tr>
  );
}

export function ItemTable({
  canEdit,
  items,
  options,
  view,
}: {
  canEdit: boolean;
  items: ManagedItem[];
  options: Options;
  view: ItemViewMode;
}) {
  const selection = useBulkSelection(items.map((item) => item.id));
  const [field, setField] = useState("commercialStatus");
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const values =
    field === "commercialStatus"
      ? itemCommercialStatuses.map((value) => [
          value,
          value.replaceAll("_", " "),
        ])
      : itemLogisticsStatuses.map((value) => [
          value,
          value.replaceAll("_", " "),
        ]);
  const headers = [...itemViewColumns[view], ...(canEdit ? ["Edit"] : [])];
  return (
    <section className="bg-card overflow-hidden rounded-lg border">
      {canEdit && view === "general" ? (
        <>
          <BulkActionBar
            action={deleteSelectedItemsAction}
            clearSelection={selection.clear}
            entityName="Item"
            scope="Only the selected Item records will be permanently deleted. Related master data is preserved."
            selectedIds={selection.selectedIds}
          />
          {selection.selectedIds.length ? (
            <div className="bg-muted/20 flex items-center gap-2 border-b px-4 py-2">
              <select
                className={control}
                onChange={(event) => setField(event.target.value)}
                value={field}
              >
                <option value="commercialStatus">Commercial status</option>
                <option value="logisticsStatus">Logistics status</option>
              </select>
              <select className={control} id="bulk-item-value">
                <option value="">Choose value</option>
                {values.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                className={saveButton}
                disabled={pending}
                onClick={() => {
                  const element = document.getElementById(
                    "bulk-item-value",
                  ) as HTMLSelectElement | null;
                  if (!element?.value) return;
                  const data = new FormData();
                  selection.selectedIds.forEach((id) =>
                    data.append("selectedIds", id),
                  );
                  data.set("field", field);
                  data.set("value", element.value);
                  startTransition(async () => {
                    const result = await bulkUpdateItemsAction(data);
                    setFeedback(result.message);
                    if (result.status === "success") selection.clear();
                  });
                }}
                type="button"
              >
                Apply
              </button>
              {feedback ? <span className="text-xs">{feedback}</span> : null}
            </div>
          ) : null}
        </>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground border-b">
            <tr>
              {canEdit && view === "general" ? (
                <SelectionHeader
                  checked={selection.allSelected}
                  disabled={!items.length}
                  onChange={selection.toggleAll}
                />
              ) : null}
              {headers.map((header) => (
                <th className="px-3 py-2" key={header}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) =>
              view === "financial" ? (
                <FinancialRow canEdit={canEdit} item={item} key={item.id} />
              ) : view === "status" ? (
                <StatusRow canEdit={canEdit} item={item} key={item.id} />
              ) : view === "tracking" ? (
                <TrackingRow
                  canEdit={canEdit}
                  item={item}
                  key={item.id}
                  options={options}
                />
              ) : (
                <GeneralRow
                  canEdit={canEdit}
                  item={item}
                  key={item.id}
                  options={options}
                  selection={selection}
                />
              ),
            )}
          </tbody>
        </table>
      </div>
      {!items.length ? (
        <p className="text-muted-foreground px-4 py-10 text-sm">
          No Items match these filters.
        </p>
      ) : null}
    </section>
  );
}
