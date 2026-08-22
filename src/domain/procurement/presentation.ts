import Decimal from "decimal.js";

export function formatMoney(amount: string | null, currency: string): string {
  if (amount === null) return "—";
  return `${new Decimal(amount).toDecimalPlaces(2).toFixed(2)} ${currency}`;
}

export function formatRate(rate: string | null): string {
  if (rate === null) return "—";
  return `${new Decimal(rate).times(100).toDecimalPlaces(2).toFixed(2)}%`;
}

export function rateToPercentInput(rate: string | null): string {
  return rate === null ? "" : new Decimal(rate).times(100).toString();
}
