import "server-only";

import type { CreateSupplierInput } from "@/domain/master-data/validation";
import {
  matchSupplierCandidates,
  type SupplierMatchResult,
} from "@/domain/quote-intake/supplier-matching";
import { getDatabase } from "@/lib/db";

export interface ExistingQuoteSupplierCandidate {
  basis: Exclude<SupplierMatchResult["basis"], null>;
  displayName: string;
  id: string;
}

export async function findQuoteSupplierDuplicates(
  input: Pick<CreateSupplierInput, "displayName" | "legalName" | "vatNumber">,
): Promise<ExistingQuoteSupplierCandidate[]> {
  const candidates = await getDatabase().supplier.findMany({
    where: { isActive: true },
    select: {
      displayName: true,
      id: true,
      legalName: true,
      vatNumber: true,
    },
  });
  const result = matchSupplierCandidates(
    {
      displayName: input.displayName,
      legalName: input.legalName,
      vatNumber: input.vatNumber ?? null,
    },
    candidates,
  );
  const basis = result.basis;
  if (!basis) return [];
  const candidateIds = new Set(result.candidateIds);
  return candidates
    .filter((candidate) => candidateIds.has(candidate.id))
    .map((candidate) => ({
      basis,
      displayName: candidate.displayName,
      id: candidate.id,
    }));
}
