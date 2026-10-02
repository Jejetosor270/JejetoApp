"use server";

import { revalidatePath } from "next/cache";
import { requireMasterDataEditor, requireUser } from "@/lib/auth/current-user";
import { reconciliationError } from "@/lib/reconciliation/action-result";
import {
  saveBankImport,
  confirmBankMatch,
  unmatchBankLine,
  searchBankCandidates,
} from "@/lib/reconciliation/service";

export async function importBankAction(input: unknown) {
  await requireMasterDataEditor();
  try {
    const result = await saveBankImport(input);
    revalidatePath("/reports/reconciliation");
    return { ok: true as const, ...result };
  } catch (error) {
    return { ok: false as const, error: reconciliationError(error) };
  }
}

export async function matchBankAction(input: unknown) {
  await requireMasterDataEditor();
  try {
    await confirmBankMatch(input);
    revalidatePath("/reports/reconciliation");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: reconciliationError(error) };
  }
}

export async function unmatchBankAction(input: unknown) {
  await requireMasterDataEditor();
  try {
    await unmatchBankLine(input);
    revalidatePath("/reports/reconciliation");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: reconciliationError(error) };
  }
}

export async function searchBankAction(input: unknown) {
  await requireUser();
  try {
    return { ok: true as const, ...(await searchBankCandidates(input)) };
  } catch (error) {
    return { ok: false as const, error: reconciliationError(error) };
  }
}
