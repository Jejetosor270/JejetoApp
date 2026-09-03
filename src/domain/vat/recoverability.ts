import Decimal from "decimal.js";

const INPUT_VAT_RECOVERABILITY_TREATMENTS = new Set([
  "DOMESTIC",
  "INTRA_EU_ACQUISITION",
  "REVERSE_CHARGE",
  "IMPORT",
  "CUSTOM",
]);

export function inputVatRecoverabilityApplies(
  treatment: string | null | undefined,
): boolean {
  return treatment ? INPUT_VAT_RECOVERABILITY_TREATMENTS.has(treatment) : false;
}

export type InputVatRecoverability =
  "NON_RECOVERABLE" | "PARTIALLY_RECOVERABLE" | "RECOVERABLE";

function rate(value: string | Decimal): Decimal {
  const result = new Decimal(value);
  if (result.isNegative() || result.greaterThan(1))
    throw new RangeError("Recoverable rate must be between 0 and 1.");
  return result;
}

export function recoverableRateFromStatus(
  recoverability: InputVatRecoverability | null | undefined,
): Decimal | null {
  if (recoverability === "RECOVERABLE") return new Decimal(1);
  if (recoverability === "NON_RECOVERABLE") return new Decimal(0);
  return null;
}

export function recoverabilityFromRate(
  recoverableRate: string | Decimal,
): InputVatRecoverability {
  const normalized = rate(recoverableRate);
  if (normalized.isZero()) return "NON_RECOVERABLE";
  if (normalized.equals(1)) return "RECOVERABLE";
  return "PARTIALLY_RECOVERABLE";
}

export function resolveRecoverableRate(input: {
  recoverability?: InputVatRecoverability | null | undefined;
  recoverableRate?: string | Decimal | null | undefined;
}): Decimal {
  if (input.recoverableRate !== null && input.recoverableRate !== undefined)
    return rate(input.recoverableRate);
  const legacyRate = recoverableRateFromStatus(input.recoverability);
  if (legacyRate !== null) return legacyRate;
  throw new RangeError("A recoverable rate is required for input VAT.");
}

export function calculateInputVatRecovery(input: {
  recoverability?: InputVatRecoverability | null | undefined;
  recoverableRate?: string | Decimal | null | undefined;
  vatAmount: string | Decimal;
}): { deductibleVat: Decimal; nonDeductibleVat: Decimal } {
  const vatAmount = new Decimal(input.vatAmount);
  if (vatAmount.isNegative())
    throw new RangeError("Input VAT amount cannot be negative.");
  if (input.recoverableRate == null && !input.recoverability)
    return { deductibleVat: new Decimal(0), nonDeductibleVat: new Decimal(0) };
  const recoverableRate = resolveRecoverableRate(input);
  const deductibleVat = vatAmount.times(recoverableRate);
  return {
    deductibleVat,
    nonDeductibleVat: vatAmount.minus(deductibleVat),
  };
}

export function vatEconomicCostContribution(input: {
  recoverability?: InputVatRecoverability | null | undefined;
  recoverableRate?: string | Decimal | null | undefined;
  vatAmount: string | Decimal;
}): Decimal {
  return calculateInputVatRecovery(input).nonDeductibleVat;
}
