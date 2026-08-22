export const countries = [
  { code: "BE", label: "Belgium" },
  { code: "CH", label: "Switzerland" },
  { code: "DE", label: "Germany" },
  { code: "ES", label: "Spain" },
  { code: "FR", label: "France" },
  { code: "GB", label: "United Kingdom" },
  { code: "IT", label: "Italy" },
  { code: "LU", label: "Luxembourg" },
  { code: "NL", label: "Netherlands" },
  { code: "PT", label: "Portugal" },
  { code: "US", label: "United States" },
] as const;

const countryCodes = new Set<string>(countries.map((country) => country.code));

export function isSupportedCountryCode(value: string): boolean {
  return countryCodes.has(value);
}

export function countryLabel(value: string | null): string {
  return countries.find((country) => country.code === value)?.label ?? "—";
}
