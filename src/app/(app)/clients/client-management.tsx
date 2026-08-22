"use client";

import { Pencil, Plus } from "lucide-react";
import { useActionState, useState } from "react";

import {
  createClientAction,
  updateClientAction,
} from "@/app/(app)/clients/actions";
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
interface ClientView {
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
  const [state, action, pending] = useActionState(
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
        action={action}
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
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    updateClientAction,
    initialMasterDataActionState,
  );
  return (
    <section className="bg-card rounded-lg border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Edit client</h2>
        <Button onClick={onClose} size="sm" type="button" variant="ghost">
          Close
        </Button>
      </div>
      <form
        action={action}
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
  return (
    <div className="space-y-5">
      {canEdit ? <CreateClientForm currencies={currencies} /> : null}
      {editing ? (
        <EditClientForm
          client={editing}
          currencies={currencies}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <section className="bg-card overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
              <tr>
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
                <tr className="hover:bg-muted/25" key={client.id}>
                  <td className="px-4 py-3 font-medium">
                    {client.displayName}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {client.legalName}
                  </td>
                  <td className="px-4 py-3">
                    {countryLabel(client.countryCode)}
                  </td>
                  <td className="px-4 py-3">{client.vatNumber ?? "—"}</td>
                  <td className="px-4 py-3 font-mono">
                    {client.defaultCurrencyCode}
                  </td>
                  <td className="px-4 py-3">{client.contactName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge active={client.isActive} />
                  </td>
                  {canEdit ? (
                    <td className="px-4 py-3 text-right">
                      <Button
                        onClick={() => setEditing(client)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Pencil data-icon="inline-start" />
                        Edit
                      </Button>
                    </td>
                  ) : null}
                </tr>
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
    </div>
  );
}
