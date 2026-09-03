export interface DecimalInputOptions {
  allowNegative?: boolean;
  maximumDecimalPlaces?: number;
}

const SPACE_SEPARATORS = /[\s\u00a0\u202f]/g;
const UNSIGNED_DECIMAL = /^\d+(?:\.\d+)?$/;

function groupedInteger(value: string, separator: "." | ","): boolean {
  const groups = value.split(separator);
  return (
    groups.length > 1 &&
    /^\d{1,3}$/.test(groups[0] ?? "") &&
    groups.slice(1).every((group) => /^\d{3}$/.test(group))
  );
}

/**
 * Converts a human-entered decimal to a canonical dot-decimal string.
 * Spaces are grouping separators. A single comma or point is treated as the
 * decimal separator; legacy grouped input is accepted only when unambiguous.
 */
export function normalizeDecimalInput(
  input: string,
  { allowNegative = true, maximumDecimalPlaces = 10 }: DecimalInputOptions = {},
): string | null {
  const compact = input.trim().replace(SPACE_SEPARATORS, "");
  if (compact === "") return "";

  const negative = compact.startsWith("-");
  if (negative && !allowNegative) return null;
  const unsigned = negative ? compact.slice(1) : compact;
  if (!unsigned || /[^\d.,]/.test(unsigned)) return null;

  const commaCount = (unsigned.match(/,/g) ?? []).length;
  const pointCount = (unsigned.match(/\./g) ?? []).length;
  let canonical = unsigned;

  if (commaCount > 0 && pointCount > 0) {
    const decimalSeparator =
      unsigned.lastIndexOf(",") > unsigned.lastIndexOf(".") ? "," : ".";
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    const decimalIndex = unsigned.lastIndexOf(decimalSeparator);
    const integerPart = unsigned.slice(0, decimalIndex);
    const fractionPart = unsigned.slice(decimalIndex + 1);
    if (
      !fractionPart ||
      fractionPart.includes(groupingSeparator) ||
      !groupedInteger(integerPart, groupingSeparator)
    )
      return null;
    canonical = `${integerPart.replaceAll(groupingSeparator, "")}.${fractionPart}`;
  } else if (commaCount > 1 || pointCount > 1) {
    const separator = commaCount > 1 ? "," : ".";
    if (!groupedInteger(unsigned, separator)) return null;
    canonical = unsigned.replaceAll(separator, "");
  } else if (commaCount === 1) {
    canonical = unsigned.replace(",", ".");
  }

  if (!UNSIGNED_DECIMAL.test(canonical)) return null;
  const [integer = "0", fraction] = canonical.split(".");
  if (fraction !== undefined && fraction.length > maximumDecimalPlaces)
    return null;
  const normalizedInteger = integer.replace(/^0+(?=\d)/, "");
  return `${negative ? "-" : ""}${normalizedInteger}${fraction === undefined ? "" : `.${fraction}`}`;
}

export function normalizeNumericText(
  value: unknown,
  options?: DecimalInputOptions,
): unknown {
  if (typeof value !== "string") return value;
  const normalized = normalizeDecimalInput(value, options);
  return normalized === null ? value : normalized;
}
