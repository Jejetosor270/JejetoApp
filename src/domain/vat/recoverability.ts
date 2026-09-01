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
