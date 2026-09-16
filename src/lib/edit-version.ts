import "server-only";
import { createHash } from "node:crypto";

function canonical(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if ("toJSON" in value && typeof value.toJSON === "function")
    return value.toJSON();
  if (Array.isArray(value))
    return value
      .map(canonical)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

/** Content version includes dependent allocations, prices and cash, not just parent updatedAt. */
export function editVersion(record: object): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(record)))
    .digest("hex");
}

export function editFieldVersions(record: object): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(record).map(([key, value]) => [
        key,
        editVersion({ value }),
      ]),
    ),
  );
}

export function assertEditVersion(
  expected: string | undefined,
  current: object,
  previousFields?: string,
) {
  if (expected && expected !== editVersion(current)) {
    let changed = "record or related financial/payment data";
    if (previousFields) {
      try {
        const before: unknown = JSON.parse(previousFields);
        if (before && typeof before === "object") {
          const now = JSON.parse(editFieldVersions(current)) as Record<
            string,
            string
          >;
          const keys = Object.entries(before)
            .filter(([key, value]) => key in now && value !== now[key])
            .map(([key]) => key.replace(/([a-z])([A-Z])/g, "$1 $2"));
          if (keys.length) changed = keys.join(", ");
        }
      } catch {
        /* The authoritative full version check still rejects this save. */
      }
    }
    throw new Error(
      `Changed since editing began: ${changed}. Your draft is retained. Reload and compare the latest details before saving.`,
    );
  }
}
