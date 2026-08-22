import { describe, expect, it } from "vitest";

import {
  countries,
  isEuCountry,
  isSupportedCountryCode,
} from "@/config/countries";

const requiredCodes = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "CH",
  "GB",
] as const;

describe("supported countries", () => {
  it("accepts every Phase 5 country code", () => {
    expect(requiredCodes.every(isSupportedCountryCode)).toBe(true);
    expect(new Set(countries.map(({ code }) => code)).size).toBe(
      countries.length,
    );
  });

  it("rejects malformed and unsupported country codes", () => {
    expect(isSupportedCountryCode("fr")).toBe(false);
    expect(isSupportedCountryCode("FRA")).toBe(false);
    expect(isSupportedCountryCode("XX")).toBe(false);
  });

  it("classifies EU membership without treating GB or CH as EU", () => {
    expect(countries.filter(({ region }) => region === "EU")).toHaveLength(27);
    expect(isEuCountry("FR")).toBe(true);
    expect(isEuCountry("GB")).toBe(false);
    expect(isEuCountry("CH")).toBe(false);
  });
});
