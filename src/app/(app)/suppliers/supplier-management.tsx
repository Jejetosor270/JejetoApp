"use client";

import { Pencil, Plus } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import {
  createSupplierAction,
  deleteSelectedSuppliersAction,
  updateSupplierAction,
} from "@/app/(app)/suppliers/actions";
import {
  BulkActionBar,
  SelectionCell,
  SelectionHeader,
  useBulkSelection,
} from "@/components/bulk-actions/bulk-selection";
import {
  InlineCheckbox,
  InlineEditActions,
  InlineSelect,
  InlineTextInput,
} from "@/components/inline-editing/inline-edit";
import { initialMasterDataActionState } from "@/components/master-data/action-state";
import {
  ActionFeedback,
  Field,
  inputClassName,
  StatusBadge,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import { countries, countryLabel } from "@/config/countries";

interface CurrencyOption {
  code: string;
  name: string;
}
interface SupplierView {
  _count: { orders: number };
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  contactName: string | null;
  countryCode: string | null;
  defaultCurrencyCode: string;
  defaultLeadTimeWeeks: number | null;
  defaultPaymentTermsDays: number | null;
  defaultPaymentTermsNotes: string | null;
  displayName: string;
  email: string | null;
  id: string;
  isActive: boolean;
  legalName: string;
  notes: string | null;
  phone: string | null;
  postalCode: string | null;
  vatNumber: string | null;
}

function SupplierFields({
  currencies,
  supplier,
}: {
  currencies: CurrencyOption[];
  supplier?: SupplierView;
}) {
  return (
    <>
      <Field label="Display name">
        <input
          className={inputClassName}
          defaultValue={supplier?.displayName}
          name="displayName"
          required
        />
      </Field>
      <Field label="Legal name">
        <input
          className={inputClassName}
          defaultValue={supplier?.legalName}
          name="legalName"
          required
        />
      </Field>
      <Field label="Country">
        <select
          className={inputClassName}
          defaultValue={supplier?.countryCode ?? ""}
          name="countryCode"
        >
          <option value="">Not specified</option>
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Default currency">
        <select
          className={inputClassName}
          defaultValue={supplier?.defaultCurrencyCode ?? currencies[0]?.code}
          name="defaultCurrencyCode"
          required
        >
          {currencies.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} — {currency.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="VAT number">
        <input
          className={inputClassName}
          defaultValue={supplier?.vatNumber ?? ""}
          name="vatNumber"
        />
      </Field>
      <Field label="Primary contact">
        <input
          className={inputClassName}
          defaultValue={supplier?.contactName ?? ""}
          name="contactName"
        />
      </Field>
      <Field label="Email">
        <input
          className={inputClassName}
          defaultValue={supplier?.email ?? ""}
          name="email"
          type="email"
        />
      </Field>
      <Field label="Phone">
        <input
          className={inputClassName}
          defaultValue={supplier?.phone ?? ""}
          name="phone"
        />
      </Field>
      <Field label="Address">
        <input
          className={inputClassName}
          defaultValue={supplier?.addressLine1 ?? ""}
          name="addressLine1"
        />
      </Field>
      <Field label="Address line 2">
        <input
          className={inputClassName}
          defaultValue={supplier?.addressLine2 ?? ""}
          name="addressLine2"
        />
      </Field>
      <Field label="City">
        <input
          className={inputClassName}
          defaultValue={supplier?.city ?? ""}
          name="city"
        />
      </Field>
      <Field label="Postal code">
        <input
          className={inputClassName}
          defaultValue={supplier?.postalCode ?? ""}
          name="postalCode"
        />
      </Field>
      <Field label="Default lead time (weeks)">
        <input
          className={inputClassName}
          defaultValue={supplier?.defaultLeadTimeWeeks ?? ""}
          min="0"
          name="defaultLeadTimeWeeks"
          type="number"
        />
      </Field>
      <Field label="Default payment terms (days)">
        <input
          className={inputClassName}
          defaultValue={supplier?.defaultPaymentTermsDays ?? ""}
          min="0"
          name="defaultPaymentTermsDays"
          type="number"
        />
      </Field>
      <label className="grid gap-1.5 text-sm font-medium md:col-span-2">
        Default payment terms notes
        <textarea
          className={`${inputClassName} h-20 py-2`}
          defaultValue={supplier?.defaultPaymentTermsNotes ?? ""}
          name="defaultPaymentTermsNotes"
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium md:col-span-2">
        Notes
        <textarea
          className={`${inputClassName} h-20 py-2`}
          defaultValue={supplier?.notes ?? ""}
          name="notes"
        />
      </label>
    </>
  );
}

function CreateSupplierForm({ currencies }: { currencies: CurrencyOption[] }) {
  const [state, action, pending] = useActionState(
    createSupplierAction,
    initialMasterDataActionState,
  );
  return (
    <details className="bg-card rounded-lg border">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">
        <span className="inline-flex items-center gap-2">
          <Plus className="size-4" /> Add supplier
        </span>
      </summary>
      <form
        action={action}
        className="grid gap-3 border-t p-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <SupplierFields currencies={currencies} />
        <div className="flex items-end gap-3 md:col-span-2 xl:col-span-4">
          <SubmitButton pending={pending}>Create supplier</SubmitButton>
          <ActionFeedback state={state} />
        </div>
      </form>
    </details>
  );
}
function EditSupplierForm({
  currencies,
  onClose,
  supplier,
}: {
  currencies: CurrencyOption[];
  onClose: () => void;
  supplier: SupplierView;
}) {
  const [state, action, pending] = useActionState(
    updateSupplierAction,
    initialMasterDataActionState,
  );
  return (
    <section className="bg-card rounded-lg border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Edit supplier</h2>
        <Button onClick={onClose} size="sm" type="button" variant="ghost">
          Close
        </Button>
      </div>
      <form
        action={action}
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        <input name="id" type="hidden" value={supplier.id} />
        <SupplierFields currencies={currencies} supplier={supplier} />
        <label className="flex h-9 items-center gap-2 self-end text-sm font-medium">
          <input
            className="accent-primary size-4"
            defaultChecked={supplier.isActive}
            name="isActive"
            type="checkbox"
          />
          Supplier active
        </label>
        <div className="flex items-end gap-3 md:col-span-2 xl:col-span-4">
          <SubmitButton pending={pending}>Save changes</SubmitButton>
          <ActionFeedback state={state} />
        </div>
      </form>
    </section>
  );
}

function SupplierInlineRow({
  canEdit,
  currencies,
  isSelected,
  onFullEdit,
  onSelect,
  supplier,
}: {
  canEdit: boolean;
  currencies: CurrencyOption[];
  isSelected: boolean;
  onFullEdit: () => void;
  onSelect: () => void;
  supplier: SupplierView;
}) {
  const initial = () => ({
    countryCode: supplier.countryCode ?? "",
    defaultCurrencyCode: supplier.defaultCurrencyCode,
    displayName: supplier.displayName,
    isActive: supplier.isActive,
    legalName: supplier.legalName,
    vatNumber: supplier.vatNumber ?? "",
  });
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const set = (field: keyof typeof draft, value: string | boolean) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const save = () => {
    const data = new FormData();
    Object.entries({
      addressLine1: supplier.addressLine1 ?? "",
      addressLine2: supplier.addressLine2 ?? "",
      city: supplier.city ?? "",
      contactName: supplier.contactName ?? "",
      countryCode: draft.countryCode,
      defaultCurrencyCode: draft.defaultCurrencyCode,
      defaultLeadTimeWeeks: supplier.defaultLeadTimeWeeks?.toString() ?? "",
      defaultPaymentTermsDays:
        supplier.defaultPaymentTermsDays?.toString() ?? "",
      defaultPaymentTermsNotes: supplier.defaultPaymentTermsNotes ?? "",
      displayName: draft.displayName,
      email: supplier.email ?? "",
      id: supplier.id,
      legalName: draft.legalName,
      notes: supplier.notes ?? "",
      phone: supplier.phone ?? "",
      postalCode: supplier.postalCode ?? "",
      vatNumber: draft.vatNumber,
    }).forEach(([key, value]) => data.set(key, value));
    if (draft.isActive) data.set("isActive", "on");
    startTransition(async () => {
      const result = await updateSupplierAction(
        initialMasterDataActionState,
        data,
      );
      setFeedback(result.message ?? "");
      if (result.status === "success") {
        setSaved(draft);
        setEditing(false);
      }
    });
  };
  return (
    <tr className="hover:bg-muted/25 align-top">
      {canEdit ? (
        <SelectionCell
          checked={isSelected}
          label={`Supplier ${saved.displayName}`}
          onChange={onSelect}
        />
      ) : null}
      <td className="px-4 py-3 font-medium">
        {editing ? (
          <InlineTextInput
            ariaLabel="Supplier display name"
            onChange={(value) => set("displayName", value)}
            value={draft.displayName}
          />
        ) : (
          saved.displayName
        )}
      </td>
      <td className="text-muted-foreground px-4 py-3">
        {editing ? (
          <InlineTextInput
            ariaLabel="Supplier legal name"
            onChange={(value) => set("legalName", value)}
            value={draft.legalName}
          />
        ) : (
          saved.legalName
        )}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <InlineSelect
            ariaLabel="Supplier country"
            onChange={(value) => set("countryCode", value)}
            value={draft.countryCode}
          >
            <option value="">Not specified</option>
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.label}
              </option>
            ))}
          </InlineSelect>
        ) : (
          countryLabel(saved.countryCode)
        )}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <InlineTextInput
            ariaLabel="Supplier VAT number"
            onChange={(value) => set("vatNumber", value)}
            value={draft.vatNumber}
          />
        ) : (
          saved.vatNumber || "—"
        )}
      </td>
      <td className="px-4 py-3 font-mono">
        {editing ? (
          <InlineSelect
            ariaLabel="Supplier default currency"
            onChange={(value) => set("defaultCurrencyCode", value)}
            value={draft.defaultCurrencyCode}
          >
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code}
              </option>
            ))}
          </InlineSelect>
        ) : (
          saved.defaultCurrencyCode
        )}
      </td>
      <td className="px-4 py-3">
        {supplier.defaultLeadTimeWeeks === null
          ? "—"
          : `${supplier.defaultLeadTimeWeeks} weeks`}
      </td>
      <td className="px-4 py-3">{supplier.contactName ?? "—"}</td>
      <td className="px-4 py-3">
        {editing ? (
          <InlineCheckbox
            ariaLabel="Supplier active"
            checked={draft.isActive}
            onChange={(event) => set("isActive", event.target.checked)}
          />
        ) : (
          <StatusBadge active={saved.isActive} />
        )}
      </td>
      {canEdit ? (
        <td className="px-4 py-3 text-right">
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
          {!editing ? (
            <Button
              className="mt-1"
              onClick={onFullEdit}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Pencil data-icon="inline-start" /> Full details
            </Button>
          ) : null}
        </td>
      ) : null}
    </tr>
  );
}

export function SupplierManagement({
  canEdit,
  currencies,
  suppliers,
}: {
  canEdit: boolean;
  currencies: CurrencyOption[];
  suppliers: SupplierView[];
}) {
  const [editing, setEditing] = useState<SupplierView | null>(null);
  const selection = useBulkSelection(suppliers.map((supplier) => supplier.id));
  const affectedOrderCount = suppliers
    .filter((supplier) => selection.selectedIds.includes(supplier.id))
    .reduce((total, supplier) => total + supplier._count.orders, 0);
  return (
    <div className="space-y-5">
      {canEdit ? <CreateSupplierForm currencies={currencies} /> : null}
      {editing ? (
        <EditSupplierForm
          currencies={currencies}
          onClose={() => setEditing(null)}
          supplier={editing}
        />
      ) : (
        <section className="bg-card overflow-hidden rounded-lg border">
          {canEdit ? (
            <BulkActionBar
              action={deleteSelectedSuppliersAction}
              clearSelection={selection.clear}
              entityName="Supplier"
              impactSummary={`${affectedOrderCount} Procurement Order${affectedOrderCount === 1 ? "" : "s"} and all downstream records will also be deleted.`}
              scope="Deleting the selected Suppliers will also permanently delete their Procurement Orders, payments, settlements, quote-import history, financial records, and Building links. Projects and Clients are preserved."
              selectedIds={selection.selectedIds}
            />
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[55rem] text-left text-sm">
              <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
                <tr>
                  {canEdit ? (
                    <SelectionHeader
                      checked={selection.allSelected}
                      disabled={suppliers.length === 0}
                      onChange={selection.toggleAll}
                    />
                  ) : null}
                  <th className="px-4 py-3">Display name</th>
                  <th className="px-4 py-3">Legal name</th>
                  <th className="px-4 py-3">Country</th>
                  <th className="px-4 py-3">VAT</th>
                  <th className="px-4 py-3">Currency</th>
                  <th className="px-4 py-3">Lead time</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Status</th>
                  {canEdit ? (
                    <th className="px-4 py-3 text-right">Action</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y">
                {suppliers.map((supplier) => (
                  <SupplierInlineRow
                    canEdit={canEdit}
                    currencies={currencies}
                    isSelected={selection.isSelected(supplier.id)}
                    key={supplier.id}
                    onFullEdit={() => setEditing(supplier)}
                    onSelect={() => selection.toggle(supplier.id)}
                    supplier={supplier}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {suppliers.length === 0 ? (
            <p className="text-muted-foreground px-4 py-8 text-sm">
              No suppliers yet.
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
