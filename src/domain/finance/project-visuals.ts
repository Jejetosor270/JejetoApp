import Decimal from "decimal.js";

/** Presentation geometry only. Authoritative amounts remain Decimal strings. */
export function comparisonWidths(values: readonly (string | null)[]) {
  if (values.some((value) => value === null)) return values.map(() => null);
  const maximum = Decimal.max(
    0,
    ...values.map((value) => new Decimal(value ?? "0").abs()),
  );
  return values.map((value) =>
    maximum.isZero()
      ? "0"
      : new Decimal(value ?? "0").abs().div(maximum).times(100).toFixed(4),
  );
}

export function amountTone(value: string | null) {
  if (value === null) return "unknown";
  const amount = new Decimal(value);
  return amount.isZero()
    ? "neutral"
    : amount.isNegative()
      ? "negative"
      : "positive";
}

export function billingProgress(issued: string | null, planned: string | null) {
  if (
    issued === null ||
    planned === null ||
    new Decimal(planned).lessThanOrEqualTo(0)
  )
    return null;
  return Decimal.max(
    0,
    Decimal.min(100, new Decimal(issued).div(planned).times(100)),
  ).toFixed(4);
}

export function hasDisplayRoundingDifference(
  values: readonly (string | null)[],
  total: string | null,
) {
  if (total === null || values.some((value) => value === null)) return false;
  const visibleSum = values.reduce(
    (sum, value) =>
      sum.plus(
        new Decimal(value ?? "0").toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      ),
    new Decimal(0),
  );
  return !visibleSum.equals(
    new Decimal(total).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
  );
}
