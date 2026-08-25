export interface SupplierMatchCandidate {
  displayName: string;
  id: string;
  legalName: string;
  vatNumber: string | null;
}

export interface SupplierMatchResult {
  basis: "VAT_NUMBER" | "LEGAL_NAME" | "DISPLAY_NAME" | null;
  candidateIds: string[];
  suggestedSupplierId: string | null;
  status: "MATCHED" | "AMBIGUOUS" | "NOT_FOUND";
}

export function normalizeVatNumber(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized || null;
}

export function normalizeSupplierName(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  return normalized || null;
}

function result(
  basis: SupplierMatchResult["basis"],
  matches: SupplierMatchCandidate[],
): SupplierMatchResult {
  if (matches.length === 1) {
    return {
      basis,
      candidateIds: [matches[0]!.id],
      suggestedSupplierId: matches[0]!.id,
      status: "MATCHED",
    };
  }
  if (matches.length > 1) {
    return {
      basis,
      candidateIds: matches.map((item) => item.id),
      suggestedSupplierId: null,
      status: "AMBIGUOUS",
    };
  }
  return {
    basis: null,
    candidateIds: [],
    suggestedSupplierId: null,
    status: "NOT_FOUND",
  };
}

export function matchSupplierCandidates(
  extracted: {
    displayName: string | null;
    legalName: string | null;
    vatNumber: string | null;
  },
  candidates: SupplierMatchCandidate[],
): SupplierMatchResult {
  const vatNumber = normalizeVatNumber(extracted.vatNumber);
  if (vatNumber) {
    const vatMatches = candidates.filter(
      (item) => normalizeVatNumber(item.vatNumber) === vatNumber,
    );
    if (vatMatches.length) return result("VAT_NUMBER", vatMatches);
  }
  const legalName = normalizeSupplierName(extracted.legalName);
  if (legalName) {
    const legalMatches = candidates.filter(
      (item) => normalizeSupplierName(item.legalName) === legalName,
    );
    if (legalMatches.length) return result("LEGAL_NAME", legalMatches);
  }
  const displayName = normalizeSupplierName(extracted.displayName);
  if (displayName) {
    const displayMatches = candidates.filter(
      (item) => normalizeSupplierName(item.displayName) === displayName,
    );
    if (displayMatches.length) return result("DISPLAY_NAME", displayMatches);
  }
  return result(null, []);
}
