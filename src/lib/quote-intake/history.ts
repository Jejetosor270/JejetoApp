import "server-only";

import { dateToDateOnly } from "@/domain/payments/dates";
import { getDatabase } from "@/lib/db";

export interface SupplierQuoteImportView {
  action: "CREATED_ORDER" | "UPDATED_ORDER";
  extractionModel: string;
  extractionProvider: string;
  id: string;
  originalFilename: string;
  processedAt: string;
  processedByName: string | null;
  quoteDate: string | null;
  supplierQuoteReference: string | null;
}

export async function listOrderQuoteImports(
  orderId: string,
): Promise<SupplierQuoteImportView[]> {
  const records = await getDatabase().supplierQuoteImport.findMany({
    where: { orderId },
    orderBy: { processedAt: "desc" },
    select: {
      action: true,
      extractionModel: true,
      extractionProvider: true,
      id: true,
      originalFilename: true,
      processedAt: true,
      processedBy: { select: { name: true } },
      quoteDate: true,
      supplierQuoteReference: true,
    },
  });
  return records.map((record) => ({
    action: record.action,
    extractionModel: record.extractionModel,
    extractionProvider: record.extractionProvider,
    id: record.id,
    originalFilename: record.originalFilename,
    processedAt: record.processedAt.toISOString(),
    processedByName: record.processedBy?.name ?? null,
    quoteDate: record.quoteDate ? dateToDateOnly(record.quoteDate) : null,
    supplierQuoteReference: record.supplierQuoteReference,
  }));
}
