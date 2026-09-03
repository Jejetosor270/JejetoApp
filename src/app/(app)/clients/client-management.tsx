"use client";

import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
import {
  InlineCheckbox,
  InlineEditActions,
  InlineSelect,
  InlineTextInput,
} from "@/components/inline-editing/inline-edit";
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

function CreateClientForm({ currencies }: { currencies: CurrencyOption[] }) {
  const { state, onSubmit, pending } = usePersistentActionState(
    createClientAction,
    initialMasterDataActionState,
  );
  return (
    <details className="bg-card rounded-lg border">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">
        <span className="inline-flex items-center gap-2">
          <Plus className="size-4" /> Add client
        </span>
      </summary>
      <form
        onSubmit={onSubmit}
        className="grid gap-3 border-t p-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <ClientFields currencies={currencies} />
        <div className="flex items-end gap-3 md:col-span-2 xl:col-span-4">
          <SubmitButton pending={pending}>Create client</SubmitButton>
          <ActionFeedback state={state} />
        </div>
      </form>
    </details>
  );
}

function EditClientForm({
  client,
  currencies,
  onClose,
}: {
  client: ClientView;
  currencies: CurrencyOption[];
  onClose?: () => void;
}) {
  const { state, onSubmit, pending } = usePersistentActionState(
    updateClientAction,
    initialMasterDataActionState,
  );
  return (
    <section className="bg-card rounded-lg border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Edit client</h2>
        {onClose ? (
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            Close
          </Button>
        ) : null}
      </div>
      <form
        onSubmit={onSubmit}
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
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
        <div className="flex items-end gap-3 md:col-span-2 xl:col-span-4">
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
  const initial = () => ({
    countryCode: client.countryCode ?? "",
    displayName: client.displayName,
    isActive: client.isActive,
    legalName: client.legalName,
  });
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const save = () => {
    const data = new FormData();
    Object.entries({
      billingAddressLine1: client.billingAddressLine1 ?? "",
      billingAddressLine2: client.billingAddressLine2 ?? "",
      billingCity: client.billingCity ?? "",
      billingPostalCode: client.billingPostalCode ?? "",
      contactName: client.contactName ?? "",
      countryCode: draft.countryCode,
      defaultCurrencyCode: client.defaultCurrencyCode,
      displayName: draft.displayName,
      email: client.email ?? "",
      id: client.id,
      legalName: draft.legalName,
      notes: client.notes ?? "",
      phone: client.phone ?? "",
      vatNumber: client.vatNumber ?? "",
    }).forEach(([key, value]) => data.set(key, value));
    if (draft.isActive) data.set("isActive", "on");
    startTransition(async () => {
      const result = await updateClientAction(
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
    <tr
      className="hover:bg-muted/25 cursor-pointer align-top"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a,button,input,select"))
          return;
        router.push(`/clients/${client.id}`);
      }}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          !(event.target as HTMLElement).closest("a,button,input,select")
        )
          router.push(`/clients/${client.id}`);
      }}
      tabIndex={0}
    >
      {canEdit ? (
        <SelectionCell
          checked={isSelected}
          label={`Client ${saved.displayName}`}
          onChange={onSelect}
        />
      ) : null}
      <td className="px-4 py-3 font-medium">
        {editing ? (
          <InlineTextInput
            ariaLabel="Client display name"
            onChange={(value) =>
              setDraft((current) => ({ ...current, displayName: value }))
            }
            value={draft.displayName}
          />
        ) : (
          <Link
            className="hover:text-primary hover:underline"
            href={`/clients/${client.id}`}
          >
            {saved.displayName}
          </Link>
        )}
      </td>
      <td className="text-muted-foreground px-4 py-3">
        {editing ? (
          <InlineTextInput
            ariaLabel="Client legal name"
            onChange={(value) =>
              setDraft((current) => ({ ...current, legalName: value }))
            }
            value={draft.legalName}
          />
        ) : (
          saved.legalName
        )}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <InlineSelect
            ariaLabel="Client country"
            onChange={(value) =>
              setDraft((current) => ({ ...current, countryCode: value }))
            }
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
      <td className="px-4 py-3">{client.vatNumber ?? "—"}</td>
      <td className="px-4 py-3 font-mono">{client.defaultCurrencyCode}</td>
      <td className="px-4 py-3">{client.contactName ?? "—"}</td>
      <td className="px-4 py-3">
        {editing ? (
          <InlineCheckbox
            ariaLabel="Client active"
            checked={draft.isActive}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                isActive: event.target.checked,
              }))
            }
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

export function ClientDetailEditor({
  canEdit,
  client,
  currencies,
}: {
  canEdit: boolean;
  client: ClientView;
  currencies: CurrencyOption[];
}) {
  return canEdit ? (
    <EditClientForm client={client} currencies={currencies} />
  ) : null;
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
      {canEdit ? <CreateClientForm currencies={currencies} /> : null}
      {editing ? (
        <EditClientForm
          client={editing}
          currencies={currencies}
          onClose={() => setEditing(null)}
        />
      ) : (
        <section className="bg-card overflow-hidden rounded-lg border">
          {canEdit ? (
            <BulkActionBar
              action={deleteSelectedClientsAction}
              clearSelection={selection.clear}
              entityName="Client"
              impactSummary={`${affectedProjectCount} Project${affectedProjectCount === 1 ? "" : "s"} and the complete downstream hierarchy will also be deleted.`}
              scope="Deleting the selected Clients will also permanently delete their Projects, Buildings, Supplier Orders, payments, settlements, quote-import history, and financial records. Suppliers are preserved."
              selectedIds={selection.selectedIds}
            />
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
                <tr>
                  {canEdit ? (
                    <SelectionHeader
                      checked={selection.allSelected}
                      disabled={clients.length === 0}
                      onChange={selection.toggleAll}
                    />
                  ) : null}
                  <th className="px-4 py-3">Display name</th>
                  <th className="px-4 py-3">Legal name</th>
                  <th className="px-4 py-3">Country</th>
                  <th className="px-4 py-3">VAT</th>
                  <th className="px-4 py-3">Currency</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Status</th>
                  {canEdit ? (
                    <th className="px-4 py-3 text-right">Action</th>
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
          {clients.length === 0 ? (
            <p className="text-muted-foreground px-4 py-8 text-sm">
              No clients yet.
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
