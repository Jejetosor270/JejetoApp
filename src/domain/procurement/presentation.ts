import Decimal from "decimal.js";

import { normalizeDecimalInput } from "@/domain/validation/numeric";

function formatGroupedDecimal(
  amount: string,
  minimumDecimalPlaces: number,
  maximumDecimalPlaces: number,
): string {
  const normalized = normalizeDecimalInput(amount, {
    allowNegative: true,
    // Calculated ratios can legitimately exceed persisted Decimal scale.
    // Presentation must still round them instead of returning raw precision.
    maximumDecimalPlaces: 100,
  });
  if (normalized === "") return amount;
  let parsed: Decimal;
  try {
    // Decimal calculations can serialize in exponent notation, which is not a
    // human input format but still needs safe presentation rounding.
    parsed = new Decimal(normalized ?? amount);
  } catch {
    return amount;
  }
  const decimal = parsed.toDecimalPlaces(
    maximumDecimalPlaces,
    Decimal.ROUND_HALF_UP,
  );
  const fixed = decimal.toFixed(maximumDecimalPlaces);
  const negative = fixed.startsWith("-");
  const [integer = "0", fullFraction = ""] = (
    negative ? fixed.slice(1) : fixed
  ).split(".");
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const fraction = fullFraction.replace(/0+$/, "");
  const paddedFraction = fraction.padEnd(minimumDecimalPlaces, "0");

  return `${negative ? "-" : ""}${groupedInteger}${paddedFraction ? `.${paddedFraction}` : ""}`;
}

export function formatDecimal(amount: string): string {
  return formatGroupedDecimal(amount, 2, 2);
}

export function formatMoneyInput(amount: string | null | undefined): string {
  if (!amount?.trim()) return "";
  const normalized = normalizeDecimalInput(amount, {
    allowNegative: false,
    maximumDecimalPlaces: 4,
  });
  return normalized === null || normalized === ""
    ? amount
    : formatDecimal(normalized);
}

export function normalizeMoneyInput(value: string): string | null {
  return normalizeDecimalInput(value, {
    allowNegative: false,
    maximumDecimalPlaces: 4,
  });
}

export function finalizeMoneyInput(value: string): string {
  const normalized = normalizeMoneyInput(value);
  return normalized === null ? value : normalized;
}

export function formatMoney(amount: string | null, currency: string): string {
  if (amount === null) return "—";
  return `${formatDecimal(amount)} ${currency}`;
}

function formatHumanPercentageValue(value: string): string {
  return formatGroupedDecimal(value, 0, 2);
}

/** Formats a stored fractional rate: 0.155 means 15.5%. */
export function formatPercentage(rate: string | null): string {
  if (rate === null) return "—";
  return `${formatHumanPercentageValue(new Decimal(rate).times(100).toString())}%`;
}

/** Formats a value that is already expressed in human percentage points. */
export function formatHumanPercentage(value: string | null): string {
  return value === null ? "—" : `${formatHumanPercentageValue(value)}%`;
}

export function formatPercentageInput(value: string): string {
  const withoutSuffix = value.trim().endsWith("%")
    ? value.trim().slice(0, -1).trim()
    : value;
  const normalized = normalizeDecimalInput(withoutSuffix, {
    allowNegative: false,
    maximumDecimalPlaces: 10,
  });
  return normalized === null || normalized === ""
    ? value
    : formatHumanPercentageValue(normalized);
}

export function formatRate(rate: string | null): string {
  return formatPercentage(rate);
}

export function formatQuantity(value: string): string {
  return formatGroupedDecimal(value, 0, 4);
}

export function formatFxRate(value: string | null): string {
  return value === null ? "—" : formatGroupedDecimal(value, 0, 10);
}

export function rateToPercentInput(rate: string | null): string {
  return rate === null ? "" : new Decimal(rate).times(100).toString();
}
