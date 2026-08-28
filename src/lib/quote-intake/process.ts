import "server-only";

import Decimal from "decimal.js";
import { z } from "zod";

import {
  buildQuoteReviewProposal,
  extractedText,
} from "@/domain/quote-intake/extraction";
import {
  matchSupplierCandidates,
  type SupplierMatchResult,
} from "@/domain/quote-intake/supplier-matching";
import { getDatabase } from "@/lib/db";
import type { ItemExtractionProvider } from "@/lib/items/extraction-provider";

import { validateTemporaryQuoteFile } from "./files";
import type { QuoteExtractionProvider } from "./provider";

export interface QuoteItemReviewRow {
  action: "CREATE" | "UPDATE";
  brand: string | null;
  buildingId: string | null;
  category: string | null;
  description: string | null;
  diffs: Array<{
    after: string | null;
    before: string | null;
    field: string;
  }>;
  existingItemId: string | null;
  finishColor: string | null;
  include: boolean;
  itemReference: string | null;
  name: string;
  notes: string | null;
  quantity: string | null;
  roomId: string | null;
  supplierSku: string | null;
  totalPriceHt: string | null;
  unitOfMeasure: string | null;
  unitPriceHt: string | null;
  vatRate: string | null;
  volumeEach: string | null;
  weightEach: string | null;
  warnings: string[];
}

export interface ProcessedQuoteReview {
  extraction: Awaited<
    ReturnType<QuoteExtractionProvider["extract"]>
  >["extraction"];
  model: string;
  originalFilename: string;
  orders: Array<{ id: string; orderNumber: string; packageName: string }>;
  projectId: string;
  proposal: ReturnType<typeof buildQuoteReviewProposal>;
  provider: string;
  supplierMatch: SupplierMatchResult;
  itemReview: {
    currencyCode: string | null;
    itemTotalHt: string;
    model: string;
    orderSubtotalHt: string | null;
    provider: string;
    rows: QuoteItemReviewRow[];
    warnings: string[];
  } | null;
}

export class QuoteProcessingError extends Error {}

export async function processSupplierQuote(
  projectIdValue: string,
  fileValue: FormDataEntryValue | null,
  provider: QuoteExtractionProvider,
  itemProvider?: ItemExtractionProvider,
): Promise<ProcessedQuoteReview> {
  const projectId = z.uuid().safeParse(projectIdValue);
  if (!projectId.success) {
    throw new QuoteProcessingError("Choose a valid Project.");
  }
  const database = getDatabase();
  const [project, suppliers, file] = await Promise.all([
    database.project.findUnique({
      where: { id: projectId.data },
      select: {
        id: true,
        orders: {
          orderBy: { updatedAt: "desc" },
          select: { id: true, orderNumber: true, packageName: true },
        },
      },
    }),
    database.supplier.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" },
      select: {
        displayName: true,
        id: true,
        legalName: true,
        vatNumber: true,
      },
    }),
    validateTemporaryQuoteFile(fileValue),
  ]);
  if (!project) throw new QuoteProcessingError("The Project no longer exists.");

  let result: Awaited<ReturnType<QuoteExtractionProvider["extract"]>>;
  let itemResult: Awaited<
    ReturnType<ItemExtractionProvider["extractQuoteItems"]>
  > | null = null;
  try {
    [result, itemResult] = await Promise.all([
      provider.extract(file),
      itemProvider
        ? itemProvider.extractQuoteItems(file)
        : Promise.resolve(null),
    ]);
  } finally {
    file.bytes.fill(0);
  }
  const supplierMatch = matchSupplierCandidates(
    {
      displayName: extractedText(result.extraction.supplier.displayName),
      legalName: extractedText(result.extraction.supplier.legalName),
      vatNumber: extractedText(result.extraction.supplier.vatNumber),
    },
    suppliers,
  );
  const proposal = buildQuoteReviewProposal(result.extraction);
  if (supplierMatch.status === "NOT_FOUND") {
    proposal.warnings.push(
      "No active Supplier matched the extracted VAT number or normalized names. Choose one manually; no Supplier will be created automatically.",
    );
  } else if (supplierMatch.status === "AMBIGUOUS") {
    proposal.warnings.push(
      "More than one active Supplier matched at the same priority. Choose the Supplier manually.",
    );
  }
  let itemReview: ProcessedQuoteReview["itemReview"] = null;
  if (itemResult) {
    const suggestedSupplierId = supplierMatch.suggestedSupplierId;
    const references = itemResult.extraction.items.flatMap((line) =>
      line.itemReference ? [line.itemReference] : [],
    );
    const skus = itemResult.extraction.items.flatMap((line) =>
      line.supplierSku ? [line.supplierSku] : [],
    );
    const existing = suggestedSupplierId
      ? await database.item.findMany({
          where: {
            projectId: project.id,
            supplierId: suggestedSupplierId,
            OR: [
              { itemReference: { in: references } },
              { supplierSku: { in: skus } },
            ],
          },
          select: {
            finishColor: true,
            id: true,
            itemReference: true,
            name: true,
            procurementOrderId: true,
            quantity: true,
            supplierSku: true,
            totalPurchasePriceHt: true,
            unitPurchasePriceHt: true,
          },
        })
      : [];
    const skuCounts = new Map<string, number>();
    for (const line of itemResult.extraction.items) {
      if (line.supplierSku)
        skuCounts.set(
          line.supplierSku,
          (skuCounts.get(line.supplierSku) ?? 0) + 1,
        );
    }
    const rows = itemResult.extraction.items.map((line) => {
      const matches = existing.filter(
        (item) =>
          (line.supplierSku && item.supplierSku === line.supplierSku) ||
          (line.itemReference && item.itemReference === line.itemReference),
      );
      const match = matches.length === 1 ? matches[0]! : null;
      const diffs = match
        ? (
            [
              ["Description", match.name, line.name],
              ["Quantity", match.quantity?.toString() ?? null, line.quantity],
              [
                "Unit purchase HT",
                match.unitPurchasePriceHt?.toString() ?? null,
                line.unitPriceHt,
              ],
              [
                "Total purchase HT",
                match.totalPurchasePriceHt?.toString() ?? null,
                line.totalPriceHt,
              ],
              ["Finish", match.finishColor, line.finishColor],
            ] as Array<[string, string | null, string | null]>
          )
            .filter(([, before, after]) => after !== null && before !== after)
            .map(([field, before, after]) => ({ after, before, field }))
        : [];
      const duplicateSku =
        line.supplierSku && (skuCounts.get(line.supplierSku) ?? 0) > 1;
      return {
        ...line,
        action: match ? ("UPDATE" as const) : ("CREATE" as const),
        buildingId: null,
        category: null,
        diffs,
        existingItemId: match?.id ?? null,
        include: matches.length <= 1 && !duplicateSku,
        roomId: null,
        warnings: [
          ...(matches.length > 1
            ? [
                "Multiple existing Items match this line; leave it excluded until resolved.",
              ]
            : []),
          ...(duplicateSku
            ? [
                "Supplier SKU occurs more than once in this quote; verify the location lines before importing.",
              ]
            : []),
        ],
      };
    });
    const itemTotal = rows.reduce(
      (sum, row) => (row.totalPriceHt ? sum.plus(row.totalPriceHt) : sum),
      new Decimal(0),
    );
    const orderSubtotal = proposal.financial.purchaseCost;
    const warnings = [...itemResult.extraction.warnings];
    if (
      orderSubtotal &&
      !itemTotal.minus(orderSubtotal).abs().lessThanOrEqualTo("0.02")
    ) {
      warnings.push(
        `Item lines total ${itemTotal.toFixed(4)} does not reconcile to quote goods HT ${orderSubtotal}. Review freight, discounts, miscellaneous charges, rounding, or missing lines.`,
      );
    }
    itemReview = {
      currencyCode: itemResult.extraction.currencyCode,
      itemTotalHt: itemTotal.toFixed(4),
      model: itemResult.model,
      orderSubtotalHt: orderSubtotal,
      provider: itemResult.provider,
      rows,
      warnings,
    };
  }
  return {
    extraction: result.extraction,
    model: result.model,
    originalFilename: file.filename,
    orders: project.orders,
    projectId: project.id,
    proposal,
    provider: result.provider,
    supplierMatch,
    itemReview,
  };
}
