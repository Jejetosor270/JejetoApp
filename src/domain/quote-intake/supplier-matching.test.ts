import { describe, expect, it } from "vitest";

import {
  matchSupplierCandidates,
  normalizeSupplierName,
  normalizeVatNumber,
} from "@/domain/quote-intake/supplier-matching";

const candidates = [
  {
    displayName: "Maison Exemple",
    id: "supplier-1",
    legalName: "Maison Exemple S.A.S.",
    vatNumber: "FR12345678901",
  },
  {
    displayName: "Atelier du Chêne",
    id: "supplier-2",
    legalName: "Atelier du Chêne SARL",
    vatNumber: "FR99887766554",
  },
];

describe("supplier quote matching", () => {
  it("prioritizes normalized VAT over names", () => {
    expect(
      matchSupplierCandidates(
        {
          displayName: "Wrong name",
          legalName: "Wrong legal name",
          vatNumber: "FR 12 345 678 901",
        },
        candidates,
      ),
    ).toMatchObject({
      basis: "VAT_NUMBER",
      status: "MATCHED",
      suggestedSupplierId: "supplier-1",
    });
  });

  it("normalizes punctuation and accents for deterministic name matching", () => {
    expect(normalizeVatNumber(" fr-12.34 ")).toBe("FR1234");
    expect(normalizeSupplierName("  Atelier du Chêne, SARL ")).toBe(
      "atelier du chene sarl",
    );
    expect(
      matchSupplierCandidates(
        {
          displayName: null,
          legalName: "ATELIER DU CHENE SARL",
          vatNumber: null,
        },
        candidates,
      ).suggestedSupplierId,
    ).toBe("supplier-2");
  });

  it("returns ambiguity instead of selecting among duplicate matches", () => {
    const result = matchSupplierCandidates(
      { displayName: "Maison Exemple", legalName: null, vatNumber: null },
      [candidates[0]!, { ...candidates[0]!, id: "supplier-duplicate" }],
    );
    expect(result.status).toBe("AMBIGUOUS");
    expect(result.suggestedSupplierId).toBeNull();
  });
});
