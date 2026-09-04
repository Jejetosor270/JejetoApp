const businessAcronyms = new Map([
  ["ai", "AI"],
  ["fx", "FX"],
  ["ht", "HT"],
  ["id", "ID"],
  ["sku", "SKU"],
  ["ttc", "TTC"],
  ["vat", "VAT"],
]);

function wordLabel(word: string): string {
  const lower = word.toLowerCase();
  return (
    businessAcronyms.get(lower) ??
    `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`
  );
}

/** Converts a persisted enum/code into a consistent business-facing label. */
export function formatEnumLabel(value: string): string {
  return value
    .trim()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(wordLabel)
    .join(" ");
}

export function formatRoleLabel(role: "ADMIN" | "MANAGER" | "USER"): string {
  return formatEnumLabel(role);
}
