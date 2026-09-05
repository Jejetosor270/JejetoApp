"use client";
import { useState, useTransition, useRef, useEffect } from "react";
import { savePackageAction } from "@/app/(app)/projects/package-actions";
import { inputClassName } from "@/components/master-data/form-ui";
import { Button } from "@/components/ui/button";

export interface PackageOption {
  id: string;
  name: string;
  isActive: boolean;
}
export function PackageSelect({
  projectId,
  packages,
  value,
  onChange,
  name = "packageId",
}: {
  projectId: string;
  packages: PackageOption[];
  value: string;
  onChange: (value: string) => void;
  name?: string;
}) {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [created, setCreated] = useState<
    (PackageOption & { projectId: string })[]
  >([]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const choices = [
    ...packages,
    ...created.filter(
      (item) =>
        item.projectId === projectId &&
        !packages.some((saved) => saved.id === item.id),
    ),
  ];
  return (
    <div className="space-y-2">
      <input
        aria-label="Search Packages"
        className={inputClassName}
        value={query}
        disabled={!projectId}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search Packages"
      />
      <select
        aria-label="Package"
        className={inputClassName}
        name={name}
        value={value}
        disabled={!projectId}
        onChange={(event) => {
          if (event.target.value === "__create") setCreating(true);
          else onChange(event.target.value);
        }}
      >
        <option value="">Unassigned</option>
        {choices
          .filter(
            (item) =>
              (item.isActive &&
                item.name
                  .toLocaleLowerCase()
                  .includes(query.toLocaleLowerCase())) ||
              item.id === value,
          )
          .map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.isActive ? "" : " (archived)"}
            </option>
          ))}
        <option value="__create">Create new Package…</option>
      </select>
      {creating ? (
        <div className="space-y-2 rounded border p-3">
          <input
            aria-label="New Package name"
            className={inputClassName}
            value={newName}
            maxLength={200}
            onChange={(event) => setNewName(event.target.value)}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={pending || !projectId}
              onClick={() =>
                startTransition(async () => {
                  const data = new FormData();
                  data.set("projectId", projectId);
                  data.set("name", newName);
                  const result = await savePackageAction({}, data);
                  if (!active.current) return;
                  if (result.status === "success" && result.record) {
                    const record = result.record;
                    setCreated((current) => [
                      ...current,
                      { ...record, projectId },
                    ]);
                    onChange(result.record.id);
                    setCreating(false);
                    setNewName("");
                    setQuery("");
                    setError("");
                  } else
                    setError(result.message ?? "Package could not be saved.");
                })
              }
            >
              {pending ? "Creating…" : "Create Package"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCreating(false)}
            >
              Cancel
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
