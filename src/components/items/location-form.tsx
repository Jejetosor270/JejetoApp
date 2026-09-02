"use client";

import { createLocationAction } from "@/app/(app)/items/actions";
import { usePersistentActionState } from "@/components/forms/use-persistent-action-state";
import { countries } from "@/config/countries";

const control = "border-input bg-background h-9 rounded-lg border px-3 text-sm";

export function LocationForm() {
  const { state, onSubmit, pending } = usePersistentActionState(
    createLocationAction,
    {
      message: "",
      status: "idle" as const,
    },
  );
  return (
    <form
      className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      onSubmit={onSubmit}
    >
      <input
        className={control}
        name="name"
        placeholder="Location name"
        required
      />
      <select className={control} name="type">
        <option value="WAREHOUSE">Warehouse</option>
        <option value="FABRICATOR">Fabricator</option>
        <option value="PROJECT_SITE">Project site</option>
        <option value="OTHER">Other</option>
      </select>
      <input className={control} name="addressLine1" placeholder="Address" />
      <input
        className={control}
        name="addressLine2"
        placeholder="Address line 2"
      />
      <input className={control} name="city" placeholder="City" />
      <input className={control} name="postalCode" placeholder="Postal code" />
      <select className={control} name="countryCode">
        <option value="">Country (optional)</option>
        {countries.map((country) => (
          <option key={country.code} value={country.code}>
            {country.label}
          </option>
        ))}
      </select>
      <input className={control} name="notes" placeholder="Notes" />
      <div className="flex items-center gap-3 md:col-span-2 xl:col-span-4">
        <button
          className="bg-primary text-primary-foreground h-9 rounded-lg px-4 text-sm font-medium disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {pending ? "Creating…" : "Create Location"}
        </button>
        {state.message ? (
          <div>
            <p
              className={
                state.status === "error"
                  ? "text-destructive text-sm"
                  : "text-sm"
              }
            >
              {state.message}
            </p>
            {state.fieldErrors ? (
              <ul className="text-destructive list-disc pl-4 text-xs">
                {Object.entries(state.fieldErrors).map(([field, message]) => (
                  <li key={field}>{message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </form>
  );
}
