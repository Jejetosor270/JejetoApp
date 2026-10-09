"use client";

import { useActionState, useEffect, useState } from "react";
import { EditorDrawer } from "@/components/forms/editor-drawer";

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
import { formatEnumLabel } from "@/domain/presentation/labels";
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
      <label className="grid gap-1.5 text-sm font-medium @lg:col-span-2">
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
      <label className="grid gap-1.5 text-sm font-medium @lg:col-span-2">
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
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currencies: Array<{ code: string; name: string }>;
  extraction: SupplierQuoteExtraction;
  fallbackCurrencyCode: string;
  onSupplierSelected: (supplier: { displayName: string; id: string }) => void;
}) {
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
  useEffect(() => {
    if (state.status === "success" && state.supplier) {
      onSupplierSelected(state.supplier);
    }
  }, [onSupplierSelected, state.status, state.supplier]);
  const setValue = (field: QuoteSupplierDraftField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  return (
    <EditorDrawer
      title="New Supplier"
      description="Review the extracted details, then create and select the Supplier. Your Order review stays unchanged."
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <form action={action} className="grid gap-3 @lg:grid-cols-2">
        <SupplierCreationFields
          currencies={currencies}
          fieldErrors={fieldErrors}
          setValue={setValue}
          values={values}
        />
        {state.duplicateCandidates?.length ? (
          <div className="bg-warning-muted rounded-md border p-3 @lg:col-span-2">
            <p className="text-sm font-medium">{state.message}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {state.duplicateCandidates.map((candidate) => (
                <Button
                  key={candidate.id}
                  onClick={() => {
                    onSupplierSelected(candidate);
                    onOpenChange(false);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Use {candidate.displayName} ·{" "}
                  {formatEnumLabel(candidate.basis).toLowerCase()}
                </Button>
              ))}
            </div>
          </div>
        ) : state.status === "error" ? (
          <p className="text-destructive text-sm @lg:col-span-2" role="alert">
            {state.message}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 @lg:col-span-2">
          <SubmitButton pending={pending}>
            Create and select Supplier
          </SubmitButton>
          <p className="text-muted-foreground text-xs">
            Duplicate VAT and normalized names are checked again before
            creation.
          </p>
        </div>
      </form>
    </EditorDrawer>
  );
}
