"use client";
import { ListEmptyState } from "@/components/listing/empty-state";

import { SortHeader } from "@/components/listing/sort-header";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

import { initialMasterDataActionState } from "@/components/master-data/action-state";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
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

export function CreateSupplierForm({
  currencies,
}: {
  currencies: CurrencyOption[];
}) {
  const { state, onSubmit, pending } = usePersistentActionState(
    createSupplierAction,
    initialMasterDataActionState,
  );
  return (
    <EditorDrawer
      title="Add supplier"
      trigger={
        <Button type="button">
          <Plus data-icon="inline-start" />
          Add supplier
        </Button>
      }
    >
      <form
        onSubmit={onSubmit}
        className="grid gap-3 border-t p-4 md:grid-cols-2"
      >
        <SupplierFields currencies={currencies} />
        <div className="flex items-end gap-3 md:col-span-2">
          <SubmitButton pending={pending}>Create supplier</SubmitButton>
          <ActionFeedback state={state} />
        </div>
      </form>
    </EditorDrawer>
  );
}
function EditSupplierForm({
  currencies,
  supplier,
}: {
  currencies: CurrencyOption[];
  supplier: SupplierView;
}) {
  const { state, onSubmit, pending } = usePersistentActionState(
    updateSupplierAction,
    initialMasterDataActionState,
  );
  return (
    <section className="bg-card rounded-lg border p-4">
      <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
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
        <div className="flex items-end gap-3 md:col-span-2">
          <SubmitButton pending={pending}>Save changes</SubmitButton>
          <ActionFeedback state={state} />
        </div>
      </form>
    </section>
  );
}

function SupplierInlineRow({
  canEdit,
  isSelected,
  onFullEdit,
  onSelect,
  supplier,
}: {
  canEdit: boolean;
  isSelected: boolean;
  onFullEdit: () => void;
  onSelect: () => void;
  supplier: SupplierView;
}) {
  const router = useRouter();
  return (
    <tr
      className="hover:bg-muted/25 cursor-pointer align-top"
      onClick={(event) => {
        if (
          (event.target as HTMLElement).closest(
            "a,button,input,select,textarea",
          )
        )
          return;
        router.push(`/suppliers/${supplier.id}`);
      }}
    >
      {canEdit ? (
        <SelectionCell
          checked={isSelected}
          label={supplier.displayName}
          onChange={onSelect}
        />
      ) : null}
      <td className="px-4 py-3">
        <Link
          className="font-medium hover:underline"
          href={`/suppliers/${supplier.id}`}
        >
          {supplier.displayName}
        </Link>
        <span className="text-muted-foreground mt-1 block text-xs">
          {supplier.legalName}
        </span>
      </td>
      <td className="px-4 py-3">{countryLabel(supplier.countryCode)}</td>
      <td className="px-4 py-3">
        {supplier.contactName ?? "—"}
        <span className="text-muted-foreground mt-1 block text-xs">
          {supplier.email ?? supplier.phone ?? ""}
        </span>
      </td>
      <td className="px-4 py-3">
        <StatusBadge active={supplier.isActive} />
      </td>
      {canEdit ? (
        <td className="px-4 py-3 text-right">
          <Button onClick={onFullEdit} size="sm" variant="outline">
            Edit
          </Button>
        </td>
      ) : null}
    </tr>
  );
}

export function SupplierDetailEditor({
  canEdit,
  currencies,
  supplier,
}: {
  canEdit: boolean;
  currencies: CurrencyOption[];
  supplier: SupplierView;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Contact & company details</h2>
        {canEdit ? (
          <EditorDrawer title="Edit supplier">
            <EditSupplierForm currencies={currencies} supplier={supplier} />
          </EditorDrawer>
        ) : null}
      </div>
      <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Legal name", supplier.legalName],
          ["Country", countryLabel(supplier.countryCode)],
          ["VAT number", supplier.vatNumber],
          ["Default currency", supplier.defaultCurrencyCode],
          ["Contact", supplier.contactName],
          ["Email", supplier.email],
          ["Phone", supplier.phone],
          [
            "Address",
            [
              supplier.addressLine1,
              supplier.addressLine2,
              supplier.postalCode,
              supplier.city,
            ]
              .filter(Boolean)
              .join(", "),
          ],
          [
            "Default lead time",
            supplier.defaultLeadTimeWeeks === null
              ? null
              : `${supplier.defaultLeadTimeWeeks} weeks`,
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-1">{value || "—"}</dd>
          </div>
        ))}
      </dl>
      {supplier.notes && (
        <p className="text-muted-foreground border-t pt-4 text-sm whitespace-pre-wrap">
          {supplier.notes}
        </p>
      )}
    </section>
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
      {editing ? (
        <EditorDrawer
          open
          title="Edit supplier"
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        >
          <EditSupplierForm currencies={currencies} supplier={editing} />
        </EditorDrawer>
      ) : null}
      <section className="bg-card overflow-hidden rounded-lg border">
        {canEdit ? (
          <BulkActionBar
            action={deleteSelectedSuppliersAction}
            clearSelection={selection.clear}
            entityName="Supplier"
            impactSummary={`${affectedOrderCount} Order${affectedOrderCount === 1 ? "" : "s"} and all downstream records will also be deleted.`}
            scope="The selected records and their dependent business records will move to Trash. Their financial effects will be removed until the group is restored from Settings."
            selectedIds={selection.selectedIds}
          />
        ) : null}
        <div
          className="max-h-[70svh] overflow-auto"
          role="region"
          aria-label="Suppliers table"
          tabIndex={0}
        >
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-muted text-muted-foreground sticky top-0 z-10 border-b text-xs">
              <tr>
                {canEdit ? (
                  <SelectionHeader
                    checked={selection.allSelected}
                    indeterminate={selection.someSelected}
                    disabled={suppliers.length === 0}
                    onChange={selection.toggleAll}
                  />
                ) : null}
                <SortHeader
                  className="px-4 py-3"
                  label="Display name"
                  field="name"
                  defaultSort="name"
                />

                <th className="px-4 py-3">Country</th>

                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Status</th>
                {canEdit ? (
                  <th className="px-4 py-3 text-right">Edit</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {suppliers.map((supplier) => (
                <SupplierInlineRow
                  canEdit={canEdit}
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
        {suppliers.length === 0 ? <ListEmptyState entity="Suppliers" /> : null}
      </section>
    </div>
  );
}
