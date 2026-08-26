import Decimal from "decimal.js";

export function formatDecimal(amount: string): string {
  const fixed = new Decimal(amount).toDecimalPlaces(2).toFixed(2);
  const negative = fixed.startsWith("-");
  const [integer = "0", fraction = "00"] = (
    negative ? fixed.slice(1) : fixed
  ).split(".");
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${negative ? "-" : ""}${groupedInteger}.${fraction}`;
}

export function formatMoneyInput(amount: string | null | undefined): string {
  if (!amount?.trim()) return "";
  return formatDecimal(amount);
}

export function normalizeMoneyInput(value: string): string | null {
  const normalized = value.replaceAll(",", "").replaceAll(/\s+/g, "").trim();
  if (normalized === "") return "";
  if (!/^(?:\d+)(?:\.\d{0,4})?$/.test(normalized)) return null;
  const [integer = "0", fraction] = normalized.split(".");
  const canonicalInteger = integer.replace(/^0+(?=\d)/, "");
  return fraction === undefined
    ? canonicalInteger
    : `${canonicalInteger}.${fraction}`;
}

export function finalizeMoneyInput(value: string): string {
  const normalized = normalizeMoneyInput(value);
  if (normalized === null || normalized === "") return "";
  return normalized.endsWith(".") ? normalized.slice(0, -1) : normalized;
}

export function formatMoney(amount: string | null, currency: string): string {
  if (amount === null) return "—";
  return `${formatDecimal(amount)} ${currency}`;
}

export function formatRate(rate: string | null): string {
  if (rate === null) return "—";
  return `${new Decimal(rate).times(100).toDecimalPlaces(2).toFixed(2)}%`;
}

export function rateToPercentInput(rate: string | null): string {
  return rate === null ? "" : new Decimal(rate).times(100).toString();
}
