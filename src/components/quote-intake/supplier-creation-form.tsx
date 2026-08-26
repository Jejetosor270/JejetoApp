"use client";

import { Plus, X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import { createQuoteSupplierAction } from "@/app/(app)/orders/import/actions";
import {
  Field,
  inputClassName,
  SubmitButton,
} from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";
import { countries } from "@/config/countries";
import { initialQuoteSupplierCreationState } from "@/domain/quote-intake/action-state";
import type { SupplierQuoteExtraction } from "@/domain/quote-intake/extraction";
import {
  buildQuoteSupplierDraft,
  type QuoteSupplierDraftField,
  type QuoteSupplierDraftValues,
} from "@/domain/quote-intake/supplier-creation";

function inputErrorClass(error: string | undefined): string {
  return `${inputClassName}${error ? " border-destructive focus-visible:border-destructive" : ""}`;
}

function SupplierCreationFields({
  currencies,
  fieldErrors,
  setValue,
  values,
}: {
  currencies: Array<{ code: string; name: string }>;
  fieldErrors: Record<string, string>;
  setValue: (field: QuoteSupplierDraftField, value: string) => void;
  values: QuoteSupplierDraftValues;
}) {
  const input = (
    field: QuoteSupplierDraftField,
    options: { required?: boolean; type?: string } = {},
  ) => (
    <input
      aria-invalid={Boolean(fieldErrors[field]) || undefined}
      className={inputErrorClass(fieldErrors[field])}
      name={field}
      onChange={(event) => setValue(field, event.target.value)}
      required={options.required}
      type={options.type}
      value={values[field]}
    />
  );
  return (
    <>
      <Field error={fieldErrors.displayName} label="Display name" required>
        {input("displayName", { required: true })}
      </Field>
      <Field error={fieldErrors.legalName} label="Legal name" required>
        {input("legalName", { required: true })}
      </Field>
      <Field error={fieldErrors.vatNumber} label="VAT number">
        {input("vatNumber")}
      </Field>
      <Field
        error={fieldErrors.defaultCurrencyCode}
        label="Default currency"
        required
      >
        <select
          aria-invalid={Boolean(fieldErrors.defaultCurrencyCode) || undefined}
          className={inputErrorClass(fieldErrors.defaultCurrencyCode)}
          name="defaultCurrencyCode"
          onChange={(event) =>
            setValue("defaultCurrencyCode", event.target.value)
          }
          required
          value={values.defaultCurrencyCode}
        >
          <option value="">Choose currency</option>
          {currencies.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} · {currency.name}
            </option>
          ))}
        </select>
      </Field>
      <Field error={fieldErrors.addressLine1} label="Address">
        {input("addressLine1")}
      </Field>
      <Field error={fieldErrors.addressLine2} label="Address line 2">
        {input("addressLine2")}
      </Field>
      <Field error={fieldErrors.city} label="City">
        {input("city")}
      </Field>
      <Field error={fieldErrors.postalCode} label="Postal code">
        {input("postalCode")}
      </Field>
      <Field error={fieldErrors.countryCode} label="Country">
        <select
          aria-invalid={Boolean(fieldErrors.countryCode) || undefined}
          className={inputErrorClass(fieldErrors.countryCode)}
          name="countryCode"
          onChange={(event) => setValue("countryCode", event.target.value)}
          value={values.countryCode}
        >
          <option value="">Not specified</option>
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.label}
            </option>
          ))}
        </select>
      </Field>
      <Field error={fieldErrors.contactName} label="Primary contact">
        {input("contactName")}
      </Field>
      <Field error={fieldErrors.email} label="Email">
        {input("email", { type: "email" })}
      </Field>
      <Field error={fieldErrors.phone} label="Phone">
        {input("phone")}
      </Field>
      <Field error={fieldErrors.defaultLeadTimeWeeks} label="Lead time weeks">
        {input("defaultLeadTimeWeeks")}
      </Field>
      <Field
        error={fieldErrors.defaultPaymentTermsDays}
        label="Default payment terms days"
      >
        {input("defaultPaymentTermsDays")}
      </Field>
      <label className="grid gap-1.5 text-sm font-medium md:col-span-2">
        Default payment terms wording
        <textarea
          className={`${inputClassName} h-20 py-2`}
          name="defaultPaymentTermsNotes"
          onChange={(event) =>
            setValue("defaultPaymentTermsNotes", event.target.value)
          }
          value={values.defaultPaymentTermsNotes}
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium md:col-span-2">
        Notes
        <textarea
          className={`${inputClassName} h-20 py-2`}
          name="notes"
          onChange={(event) => setValue("notes", event.target.value)}
          value={values.notes}
        />
      </label>
    </>
  );
}

export function QuoteSupplierCreationForm({
  currencies,
  extraction,
  fallbackCurrencyCode,
  onSupplierSelected,
}: {
  currencies: Array<{ code: string; name: string }>;
  extraction: SupplierQuoteExtraction;
  fallbackCurrencyCode: string;
  onSupplierSelected: (supplier: { displayName: string; id: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    createQuoteSupplierAction,
    initialQuoteSupplierCreationState,
  );
  const [values, setValues] = useState<QuoteSupplierDraftValues>(() => {
    const draft = buildQuoteSupplierDraft(extraction, fallbackCurrencyCode);
    return currencies.some(
      (currency) => currency.code === draft.defaultCurrencyCode,
    )
      ? draft
      : { ...draft, defaultCurrencyCode: fallbackCurrencyCode };
  });
  const fieldErrors = state.fieldErrors ?? {};
  const formOpen = open && state.status !== "success";
  useEffect(() => {
    if (state.status === "success" && state.supplier) {
      onSupplierSelected(state.supplier);
    }
  }, [onSupplierSelected, state.status, state.supplier]);
  const setValue = (field: QuoteSupplierDraftField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  return (
    <section className="bg-card rounded-lg border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Supplier selection</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Existing matches remain preferred. Creating a Supplier is always an
            explicit employee action.
          </p>
        </div>
        {state.status !== "success" ? (
          <Button
            onClick={() => setOpen((current) => !current)}
            size="sm"
            type="button"
            variant="outline"
          >
            {formOpen ? (
              <X data-icon="inline-start" />
            ) : (
              <Plus data-icon="inline-start" />
            )}
            {formOpen ? "Close Supplier form" : "Create new Supplier"}
          </Button>
        ) : null}
      </div>
      {state.status === "success" ? (
        <p className="text-positive mt-3 text-sm" role="status">
          {state.message}
        </p>
      ) : null}
      {formOpen ? (
        <form
          action={action}
          className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-2 xl:grid-cols-4"
        >
          <SupplierCreationFields
            currencies={currencies}
            fieldErrors={fieldErrors}
            setValue={setValue}
            values={values}
          />
          {state.duplicateCandidates?.length ? (
            <div className="bg-warning-muted rounded-md border p-3 md:col-span-2 xl:col-span-4">
              <p className="text-sm font-medium">{state.message}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {state.duplicateCandidates.map((candidate) => (
                  <Button
                    key={candidate.id}
                    onClick={() => {
                      onSupplierSelected(candidate);
                      setOpen(false);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Use {candidate.displayName} ·{" "}
                    {candidate.basis.replaceAll("_", " ").toLowerCase()}
                  </Button>
                ))}
              </div>
            </div>
          ) : state.status === "error" ? (
            <p
              className="text-destructive text-sm md:col-span-2 xl:col-span-4"
              role="alert"
            >
              {state.message}
            </p>
          ) : null}
          <div className="flex items-center gap-3 md:col-span-2 xl:col-span-4">
            <SubmitButton pending={pending}>
              Create and select Supplier
            </SubmitButton>
            <p className="text-muted-foreground text-xs">
              Duplicate VAT and normalized names are checked again before
              creation.
            </p>
          </div>
        </form>
      ) : null}
    </section>
  );
}
