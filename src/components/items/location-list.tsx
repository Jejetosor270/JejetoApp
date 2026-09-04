"use client";

import { useState, useTransition } from "react";

import { updateLocationInlineAction } from "@/app/(app)/items/actions";
import {
  InlineCheckbox,
  InlineEditActions,
  InlineSelect,
  InlineTextInput,
} from "@/components/inline-editing/inline-edit";
import { countries, countryLabel } from "@/config/countries";
import { formatEnumLabel } from "@/domain/presentation/labels";

interface LocationView {
  city: string | null;
  countryCode: string | null;
  id: string;
  isActive: boolean;
  name: string;
  type: "FABRICATOR" | "OTHER" | "PROJECT_SITE" | "WAREHOUSE";
}

const types = ["WAREHOUSE", "FABRICATOR", "PROJECT_SITE", "OTHER"] as const;

function LocationRow({ location }: { location: LocationView }) {
  const initial = () => ({
    countryCode: location.countryCode ?? "",
    isActive: location.isActive,
    name: location.name,
    type: location.type,
  });
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();
  const save = () => {
    const data = new FormData();
    data.set("countryCode", draft.countryCode);
    data.set("id", location.id);
    data.set("name", draft.name);
    data.set("type", draft.type);
    if (draft.isActive) data.set("isActive", "on");
    startTransition(async () => {
      const result = await updateLocationInlineAction(data);
      setFeedback(result.message);
      if (result.status === "success" && result.values) {
        const next = {
          countryCode: result.values.countryCode ?? "",
          isActive: result.values.isActive,
          name: result.values.name,
          type: result.values.type,
        };
        setSaved(next);
        setDraft(next);
        setEditing(false);
      }
    });
  };
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <InlineTextInput
            ariaLabel="Location name"
            onChange={(value) =>
              setDraft((current) => ({ ...current, name: value }))
            }
            value={draft.name}
          />
          <InlineSelect
            ariaLabel="Location type"
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                type: value as LocationView["type"],
              }))
            }
            value={draft.type}
          >
            {types.map((type) => (
              <option key={type} value={type}>
                {formatEnumLabel(type)}
              </option>
            ))}
          </InlineSelect>
          <InlineSelect
            ariaLabel="Location country"
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
          <InlineCheckbox
            ariaLabel="Location active"
            checked={draft.isActive}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                isActive: event.target.checked,
              }))
            }
          />
        </div>
      ) : (
        <span>
          <span className="font-medium">{saved.name}</span>
          <span className="text-muted-foreground ml-2 text-xs">
            {location.city ?? countryLabel(saved.countryCode)} ·{" "}
            {formatEnumLabel(saved.type)} ·{" "}
            {saved.isActive ? "Active" : "Inactive"}
          </span>
        </span>
      )}
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
    </li>
  );
}

export function LocationList({ locations }: { locations: LocationView[] }) {
  return (
    <ul className="mt-4 divide-y rounded-lg border text-sm">
      {locations.map((location) => (
        <LocationRow key={location.id} location={location} />
      ))}
      {locations.length === 0 ? (
        <li className="text-muted-foreground px-3 py-4 text-xs">
          No logistics Locations yet.
        </li>
      ) : null}
    </ul>
  );
}
