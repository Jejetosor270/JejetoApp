import "server-only";

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

import { validateTemporaryQuoteFile } from "./files";
import type { QuoteExtractionProvider } from "./provider";

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
}

export class QuoteProcessingError extends Error {}

export async function processSupplierQuote(
  projectIdValue: string,
  fileValue: FormDataEntryValue | null,
  provider: QuoteExtractionProvider,
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
  try {
    result = await provider.extract(file);
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
  return {
    extraction: result.extraction,
    model: result.model,
    originalFilename: file.filename,
    orders: project.orders,
    projectId: project.id,
    proposal,
    provider: result.provider,
    supplierMatch,
  };
}
