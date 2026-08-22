export const countries = [
  { code: "AT", label: "Austria", region: "EU" },
  { code: "BE", label: "Belgium", region: "EU" },
  { code: "BG", label: "Bulgaria", region: "EU" },
  { code: "CH", label: "Switzerland", region: "NON_EU" },
  { code: "CY", label: "Cyprus", region: "EU" },
  { code: "CZ", label: "Czechia", region: "EU" },
  { code: "DE", label: "Germany", region: "EU" },
  { code: "DK", label: "Denmark", region: "EU" },
  { code: "EE", label: "Estonia", region: "EU" },
  { code: "ES", label: "Spain", region: "EU" },
  { code: "FI", label: "Finland", region: "EU" },
  { code: "FR", label: "France", region: "EU" },
  { code: "GB", label: "United Kingdom", region: "NON_EU" },
  { code: "GR", label: "Greece", region: "EU" },
  { code: "HR", label: "Croatia", region: "EU" },
  { code: "HU", label: "Hungary", region: "EU" },
  { code: "IE", label: "Ireland", region: "EU" },
  { code: "IT", label: "Italy", region: "EU" },
  { code: "LT", label: "Lithuania", region: "EU" },
  { code: "LU", label: "Luxembourg", region: "EU" },
  { code: "LV", label: "Latvia", region: "EU" },
  { code: "MT", label: "Malta", region: "EU" },
  { code: "NL", label: "Netherlands", region: "EU" },
  { code: "PL", label: "Poland", region: "EU" },
  { code: "PT", label: "Portugal", region: "EU" },
  { code: "RO", label: "Romania", region: "EU" },
  { code: "SE", label: "Sweden", region: "EU" },
  { code: "SI", label: "Slovenia", region: "EU" },
  { code: "SK", label: "Slovakia", region: "EU" },
  // Retained so records created before the Phase 5 European expansion stay editable.
  { code: "US", label: "United States", region: "NON_EU" },
] as const;

export type SupportedCountryCode = (typeof countries)[number]["code"];
export type CountryRegion = (typeof countries)[number]["region"];

const countryCodes = new Set<string>(countries.map((country) => country.code));

export function isSupportedCountryCode(value: string): boolean {
  return countryCodes.has(value);
}

export function isEuCountry(value: string | null | undefined): boolean {
  return countries.some(
    (country) => country.code === value && country.region === "EU",
  );
}

export function countryLabel(value: string | null): string {
  return countries.find((country) => country.code === value)?.label ?? "—";
}
