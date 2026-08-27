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
  needsBudgetMappingFallback,
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
  purchaseCurrencyCode: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^[A-Z]{3}$/, "Choose a purchase currency.")
      .optional(),
  ),
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
    if (needsBudgetMappingFallback(workbook)) {
      const unresolved = [
        ...new Set([...workbook.ambiguousHeaders, ...workbook.unmappedHeaders]),
      ];
      if (unresolved.length) {
        const sampleIndexes = unresolved.map((header) =>
          workbook.headers.indexOf(header),
        );
        const result =
          await getItemExtractionProvider().suggestSpreadsheetMapping({
            headers: unresolved,
            samples: workbook.samples.map((row) =>
              sampleIndexes.map((index) => row[index] ?? ""),
            ),
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
    const mappedFields = new Set(Object.values(workbook.mapping));
    if (!mappedFields.has("description") && !mappedFields.has("itemReference"))
      throw new BudgetFileError(
        "The workbook needs a recognizable Description or Item reference column.",
      );
    if (!mappedFields.has("quantity"))
      throw new BudgetFileError(
        "The workbook needs a recognizable Quantity column.",
      );
    const hasFinancialValues = workbook.rows.some((row) =>
      [
        row.fields.unitPurchasePriceHt,
        row.fields.totalPurchasePriceHt,
        row.fields.unitSellingPriceHt,
        row.fields.totalSellingPriceHt,
      ].some(Boolean),
    );
    if (hasFinancialValues && !input.data.purchaseCurrencyCode)
      throw new BudgetFileError(
        "Choose a purchase currency because this workbook contains financial values.",
      );
    const prepared = await prepareBudgetReview(workbook, {
      buildingId: input.data.defaultBuildingId ?? null,
      currencyCode: input.data.purchaseCurrencyCode ?? null,
      projectId: input.data.projectId,
      supplierId: input.data.defaultSupplierId ?? null,
    });
    return {
      message:
        "Workbook parsed. Review and correct every included row before confirming.",
      review: {
        ambiguousHeaders: workbook.ambiguousHeaders,
        conflicts: workbook.conflicts,
        defaultBuildingId: input.data.defaultBuildingId ?? null,
        defaultSupplierId: input.data.defaultSupplierId ?? null,
        detectedTotal: workbook.detectedTotal,
        extractionModel,
        extractionProvider,
        filename: workbook.filename,
        ignoredHeaderCount: workbook.ignoredHeaders.length,
        mapping: workbook.mapping,
        mappingLevels: workbook.mappingLevels,
        projectId: input.data.projectId,
        rows: prepared.rows,
        sheets: workbook.sheets,
        summary: prepared.summary,
        unmappedHeaders: workbook.unmappedHeaders,
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
