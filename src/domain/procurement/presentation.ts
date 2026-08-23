import Decimal from "decimal.js";

function formatDecimal(amount: string): string {
  const fixed = new Decimal(amount).toDecimalPlaces(2).toFixed(2);
  const negative = fixed.startsWith("-");
  const [integer = "0", fraction = "00"] = (
    negative ? fixed.slice(1) : fixed
  ).split(".");
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${negative ? "-" : ""}${groupedInteger}.${fraction}`;
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
