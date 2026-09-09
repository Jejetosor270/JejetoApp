"use client";
import { ListEmptyState } from "@/components/listing/empty-state";

import { SortHeader } from "@/components/listing/sort-header";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createClientAction,
  deleteSelectedClientsAction,
  updateClientAction,
} from "@/app/(app)/clients/actions";
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
interface ClientView {
  _count: { projects: number };
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingPostalCode: string | null;
  contactName: string | null;
  countryCode: string | null;
  defaultCurrencyCode: string;
  displayName: string;
  email: string | null;
  id: string;
  isActive: boolean;
  legalName: string;
  notes: string | null;
  phone: string | null;
  vatNumber: string | null;
}

function ClientFields({
  client,
  currencies,
}: {
  client?: ClientView;
  currencies: CurrencyOption[];
}) {
  return (
    <>
      <Field label="Display name">
        <input
          className={inputClassName}
          defaultValue={client?.displayName}
          name="displayName"
          required
        />
      </Field>
      <Field label="Legal name">
        <input
          className={inputClassName}
          defaultValue={client?.legalName}
          name="legalName"
          required
        />
      </Field>
      <Field label="Country">
        <select
          className={inputClassName}
          defaultValue={client?.countryCode ?? ""}
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
          defaultValue={client?.defaultCurrencyCode ?? currencies[0]?.code}
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
          defaultValue={client?.vatNumber ?? ""}
          name="vatNumber"
        />
      </Field>
      <Field label="Primary contact">
        <input
          className={inputClassName}
          defaultValue={client?.contactName ?? ""}
          name="contactName"
        />
      </Field>
      <Field label="Email">
        <input
          className={inputClassName}
          defaultValue={client?.email ?? ""}
          name="email"
          type="email"
        />
      </Field>
      <Field label="Phone">
        <input
          className={inputClassName}
          defaultValue={client?.phone ?? ""}
          name="phone"
        />
      </Field>
      <Field label="Billing address">
        <input
          className={inputClassName}
          defaultValue={client?.billingAddressLine1 ?? ""}
          name="billingAddressLine1"
        />
      </Field>
      <Field label="Address line 2">
        <input
          className={inputClassName}
          defaultValue={client?.billingAddressLine2 ?? ""}
          name="billingAddressLine2"
        />
      </Field>
      <Field label="City">
        <input
          className={inputClassName}
          defaultValue={client?.billingCity ?? ""}
          name="billingCity"
        />
      </Field>
      <Field label="Postal code">
        <input
          className={inputClassName}
          defaultValue={client?.billingPostalCode ?? ""}
          name="billingPostalCode"
        />
      </Field>
      <label className="grid gap-1.5 text-sm font-medium md:col-span-2">
        Notes
        <textarea
          className={`${inputClassName} h-20 py-2`}
          defaultValue={client?.notes ?? ""}
          name="notes"
        />
      </label>
    </>
  );
}

export function CreateClientForm({
  currencies,
}: {
  currencies: CurrencyOption[];
}) {
  const { state, onSubmit, pending } = usePersistentActionState(
    createClientAction,
    initialMasterDataActionState,
  );
  return (
    <EditorDrawer
      title="Add client"
      trigger={
        <Button type="button">
          <Plus data-icon="inline-start" />
          Add client
        </Button>
      }
    >
      <form
        onSubmit={onSubmit}
        className="grid gap-3 border-t p-4 md:grid-cols-2"
      >
        <ClientFields currencies={currencies} />
        <div className="flex items-end gap-3 md:col-span-2">
          <SubmitButton pending={pending}>Create client</SubmitButton>
          <ActionFeedback state={state} />
        </div>
      </form>
    </EditorDrawer>
  );
}

function EditClientForm({
  client,
  currencies,
}: {
  client: ClientView;
  currencies: CurrencyOption[];
}) {
  const { state, onSubmit, pending } = usePersistentActionState(
    updateClientAction,
    initialMasterDataActionState,
  );
  return (
    <section className="bg-card rounded-lg border p-4">
      <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
        <input name="id" type="hidden" value={client.id} />
        <ClientFields client={client} currencies={currencies} />
        <label className="flex h-9 items-center gap-2 self-end text-sm font-medium">
          <input
            className="accent-primary size-4"
            defaultChecked={client.isActive}
            name="isActive"
            type="checkbox"
          />
          Client active
        </label>
        <div className="flex items-end gap-3 md:col-span-2">
          <SubmitButton pending={pending}>Save changes</SubmitButton>
          <ActionFeedback state={state} />
        </div>
      </form>
    </section>
  );
}

function ClientInlineRow({
  canEdit,
  client,
  isSelected,
  onFullEdit,
  onSelect,
}: {
  canEdit: boolean;
  client: ClientView;
  isSelected: boolean;
  onFullEdit: () => void;
  onSelect: () => void;
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
        router.push(`/clients/${client.id}`);
      }}
    >
      {canEdit ? (
        <SelectionCell
          checked={isSelected}
          label={client.displayName}
          onChange={onSelect}
        />
      ) : null}
      <td className="px-4 py-3">
        <Link
          className="font-medium hover:underline"
          href={`/clients/${client.id}`}
        >
          {client.displayName}
        </Link>
        <span className="text-muted-foreground mt-1 block text-xs">
          {client.legalName}
        </span>
      </td>
      <td className="px-4 py-3">{countryLabel(client.countryCode)}</td>
      <td className="px-4 py-3">
        {client.contactName ?? "—"}
        <span className="text-muted-foreground mt-1 block text-xs">
          {client.email ?? client.phone ?? ""}
        </span>
      </td>
      <td className="px-4 py-3">
        <StatusBadge active={client.isActive} />
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

export function ClientDetailEditor({
  canEdit,
  client,
  currencies,
}: {
  canEdit: boolean;
  client: ClientView;
  currencies: CurrencyOption[];
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Contact & company details</h2>
        {canEdit ? (
          <EditorDrawer title="Edit client">
            <EditClientForm client={client} currencies={currencies} />
          </EditorDrawer>
        ) : null}
      </div>
      <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Legal name", client.legalName],
          ["Country", countryLabel(client.countryCode)],
          ["VAT number", client.vatNumber],
          ["Default currency", client.defaultCurrencyCode],
          ["Contact", client.contactName],
          ["Email", client.email],
          ["Phone", client.phone],
          [
            "Billing address",
            [
              client.billingAddressLine1,
              client.billingAddressLine2,
              client.billingPostalCode,
              client.billingCity,
            ]
              .filter(Boolean)
              .join(", "),
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-1">{value || "—"}</dd>
          </div>
        ))}
      </dl>
      {client.notes && (
        <p className="text-muted-foreground border-t pt-4 text-sm whitespace-pre-wrap">
          {client.notes}
        </p>
      )}
    </section>
  );
}

export function ClientManagement({
  canEdit,
  clients,
  currencies,
}: {
  canEdit: boolean;
  clients: ClientView[];
  currencies: CurrencyOption[];
}) {
  const [editing, setEditing] = useState<ClientView | null>(null);
  const selection = useBulkSelection(clients.map((client) => client.id));
  const affectedProjectCount = clients
    .filter((client) => selection.selectedIds.includes(client.id))
    .reduce((total, client) => total + client._count.projects, 0);
  return (
    <div className="space-y-5">
      {editing ? (
        <EditorDrawer
          open
          title="Edit client"
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        >
          <EditClientForm client={editing} currencies={currencies} />
        </EditorDrawer>
      ) : null}
      <section className="bg-card overflow-hidden rounded-lg border">
        {canEdit ? (
          <BulkActionBar
            action={deleteSelectedClientsAction}
            clearSelection={selection.clear}
            entityName="Client"
            impactSummary={`${affectedProjectCount} Project${affectedProjectCount === 1 ? "" : "s"} and the complete downstream hierarchy will also be deleted.`}
            scope="The selected records and their dependent business records will move to Trash. Their financial effects will be removed until the group is restored from Settings."
            selectedIds={selection.selectedIds}
          />
        ) : null}
        <div
          className="max-h-[70svh] overflow-auto"
          role="region"
          aria-label="Clients table"
          tabIndex={0}
        >
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-muted text-muted-foreground sticky top-0 z-10 border-b text-xs">
              <tr>
                {canEdit ? (
                  <SelectionHeader
                    checked={selection.allSelected}
                    indeterminate={selection.someSelected}
                    disabled={clients.length === 0}
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
              {clients.map((client) => (
                <ClientInlineRow
                  canEdit={canEdit}
                  client={client}
                  isSelected={selection.isSelected(client.id)}
                  key={client.id}
                  onFullEdit={() => setEditing(client)}
                  onSelect={() => selection.toggle(client.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
        {clients.length === 0 ? <ListEmptyState entity="Clients" /> : null}
      </section>
    </div>
  );
}
