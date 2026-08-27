"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { confirmBudgetImportSchema } from "@/domain/items/import";
import type { BudgetImportActionState } from "@/domain/items/action-state";
import { requireMasterDataEditor } from "@/lib/auth/current-user";
import { confirmBudgetImport, prepareBudgetReview } from "@/lib/items/imports";
import {
  getItemExtractionProvider,
  ItemExtractionProviderError,
} from "@/lib/items/extraction-provider";
import {
  BudgetFileError,
  parseBudgetWorkbook,
  validateBudgetFile,
} from "@/lib/items/xlsx";

const requestSchema = z.object({
  defaultBuildingId: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.uuid().optional(),
  ),
  defaultSupplierId: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.uuid().optional(),
  ),
  projectId: z.uuid("Choose a Project."),
  purchaseCurrencyCode: z
    .string()
    .regex(/^[A-Z]{3}$/, "Choose a purchase currency."),
});

export async function analyzeBudgetAction(
  _: BudgetImportActionState,
  formData: FormData,
): Promise<BudgetImportActionState> {
  await requireMasterDataEditor();
  const input = requestSchema.safeParse(Object.fromEntries(formData));
  if (!input.success)
    return {
      message: input.error.issues[0]?.message ?? "Check the import settings.",
      status: "error",
    };
  let file: Awaited<ReturnType<typeof validateBudgetFile>> | undefined;
  try {
    file = await validateBudgetFile(formData.get("budgetFile"));
    let workbook = await parseBudgetWorkbook(file.bytes, file.filename);
    let extractionModel: string | null = null;
    let extractionProvider: string | null = null;
    if (formData.get("useAiMapping") === "on") {
      const unmapped = workbook.headers.filter(
        (header) => !workbook.mapping[header],
      );
      if (unmapped.length) {
        const result =
          await getItemExtractionProvider().suggestSpreadsheetMapping({
            headers: unmapped,
            samples: [],
          });
        extractionModel = result.model;
        extractionProvider = result.provider;
        const suggested = Object.fromEntries(
          result.suggestion.mappings
            .filter(
              (entry) => entry.field !== null && entry.confidence !== "LOW",
            )
            .map((entry) => [entry.header, entry.field]),
        ) as Record<string, import("@/domain/items/import").BudgetField>;
        workbook = await parseBudgetWorkbook(
          file.bytes,
          file.filename,
          suggested,
        );
      }
    }
    const prepared = await prepareBudgetReview(workbook, {
      buildingId: input.data.defaultBuildingId ?? null,
      currencyCode: input.data.purchaseCurrencyCode,
      projectId: input.data.projectId,
      supplierId: input.data.defaultSupplierId ?? null,
    });
    return {
      message:
        "Workbook parsed. Review and correct every included row before confirming.",
      review: {
        defaultBuildingId: input.data.defaultBuildingId ?? null,
        defaultSupplierId: input.data.defaultSupplierId ?? null,
        detectedTotal: workbook.detectedTotal,
        extractionModel,
        extractionProvider,
        filename: workbook.filename,
        mapping: workbook.mapping,
        projectId: input.data.projectId,
        rows: prepared.rows,
        sheets: workbook.sheets,
        summary: prepared.summary,
      },
      status: "ready",
    };
  } catch (error) {
    if (
      error instanceof BudgetFileError ||
      error instanceof ItemExtractionProviderError
    )
      return { message: error.message, status: "error" };
    console.error("Unable to analyze Project budget.", error);
    return {
      message:
        "The workbook could not be analyzed. Check the file and try again.",
      status: "error",
    };
  } finally {
    file?.bytes.fill(0);
  }
}

export async function confirmBudgetAction(
  payload: unknown,
): Promise<BudgetImportActionState> {
  const actor = await requireMasterDataEditor();
  const input = confirmBudgetImportSchema.safeParse(payload);
  if (!input.success)
    return {
      message: input.error.issues[0]?.message ?? "Check the reviewed rows.",
      status: "error",
    };
  try {
    const result = await confirmBudgetImport(actor.id, input.data);
    revalidatePath("/items");
    revalidatePath(`/projects/${input.data.projectId}`);
    revalidatePath("/calendar");
    revalidatePath("/search");
    return {
      message: `Import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped.`,
      status: "success",
    };
  } catch (error) {
    console.error("Unable to confirm Item import.", error);
    return {
      message:
        error instanceof Error && error.message.startsWith("Row ")
          ? error.message
          : "No Items were saved. Review the import and try again.",
      status: "error",
    };
  }
}
