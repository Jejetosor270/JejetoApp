import "server-only";

import Decimal from "decimal.js";

import { extractedValue } from "@/domain/billing/extraction";
import { getDatabase } from "@/lib/db";

import { validateTemporaryClientDocument } from "./files";
import type { ClientDocumentExtractionProvider } from "./provider";

export class ClientDocumentProcessingError extends Error {}

function normalized(value: string | null): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function exactSuggestion(
  extracted: string | null,
  candidates: readonly { id: string; values: readonly string[] }[],
): string | null {
  const key = normalized(extracted);
  if (!key) return null;
  const matches = candidates.filter((candidate) =>
    candidate.values.some((value) => normalized(value) === key),
  );
  return matches.length === 1 ? (matches[0]?.id ?? null) : null;
}

export async function processClientDocument(
  entry: FormDataEntryValue | null,
  provider: ClientDocumentExtractionProvider,
) {
  const file = await validateTemporaryClientDocument(entry);
  try {
    const [{ extraction, model, provider: providerName }, clients, projects] =
      await Promise.all([
        provider.extract(file),
        getDatabase().client.findMany({
          where: { isActive: true },
          orderBy: { displayName: "asc" },
          select: { displayName: true, id: true, legalName: true },
        }),
        getDatabase().project.findMany({
          where: { status: { not: "ARCHIVED" } },
          orderBy: { name: "asc" },
          select: { clientId: true, code: true, id: true, name: true },
        }),
      ]);
    const clientName = extractedValue(extraction.clientName);
    const projectReference = extractedValue(extraction.projectReference);
    const clientSuggestionId = exactSuggestion(
      clientName,
      clients.map((client) => ({
        id: client.id,
        values: [client.displayName, client.legalName],
      })),
    );
    const projectCandidates = clientSuggestionId
      ? projects.filter((project) => project.clientId === clientSuggestionId)
      : projects;
    const projectSuggestionId = exactSuggestion(
      projectReference,
      projectCandidates.map((project) => ({
        id: project.id,
        values: [project.code, project.name],
      })),
    );
    const reference = extractedValue(extraction.reference);
    const documentDate = extractedValue(extraction.documentDate);
    const totalHt = extractedValue(extraction.totalHt);
    const documentType = extractedValue(extraction.documentType);
    const possibleDuplicates =
      reference || documentDate || totalHt
        ? await getDatabase().clientBillingDocument.findMany({
            where: {
              ...(documentType ? { documentType } : {}),
              OR: [
                ...(reference
                  ? [
                      {
                        reference: {
                          equals: reference,
                          mode: "insensitive" as const,
                        },
                      },
                    ]
                  : []),
                ...(documentDate
                  ? [
                      {
                        documentDate: new Date(`${documentDate}T00:00:00.000Z`),
                      },
                    ]
                  : []),
                ...(totalHt ? [{ totalHt }] : []),
              ],
            },
            take: 12,
            orderBy: { updatedAt: "desc" },
            select: {
              clientId: true,
              documentDate: true,
              documentType: true,
              id: true,
              projectId: true,
              reference: true,
              totalHt: true,
            },
          })
        : [];
    const duplicateCandidates = possibleDuplicates.map((candidate) => {
      const reasons: string[] = [];
      if (
        reference &&
        normalized(reference) === normalized(candidate.reference)
      )
        reasons.push("same document number");
      if (
        documentDate &&
        candidate.documentDate.toISOString().slice(0, 10) === documentDate
      )
        reasons.push("same date");
      if (totalHt && new Decimal(candidate.totalHt).equals(totalHt))
        reasons.push("same amount");
      if (clientSuggestionId && candidate.clientId === clientSuggestionId)
        reasons.push("same Client");
      if (projectSuggestionId && candidate.projectId === projectSuggestionId)
        reasons.push("same Project");
      return {
        ...candidate,
        documentDate: candidate.documentDate.toISOString().slice(0, 10),
        reasons,
        totalHt: candidate.totalHt.toString(),
      };
    });
    const vatRates = extraction.vatLines
      .map((line) => extractedValue(line.rate))
      .filter((value): value is string => value !== null);
    const warnings = [...extraction.warnings];
    if (new Set(vatRates).size > 1) {
      warnings.push(
        "Multiple VAT rates were found. Review total VAT manually; no blended VAT rate was created.",
      );
    }
    return {
      clientSuggestionId,
      duplicateCandidates,
      extraction,
      model,
      originalFilename: file.filename,
      projectSuggestionId,
      proposal: {
        currencyCode: extractedValue(extraction.currencyCode),
        documentDate,
        documentType,
        dueDate: extractedValue(extraction.dueDate),
        installments: extraction.paymentTerms.installments.map((item) => ({
          basis: item.basis,
          dueDate: extractedValue(item.dueDate),
          fixedAmount: extractedValue(item.fixedAmount),
          label: extractedValue(item.label) ?? "Client installment",
          percentageRate: extractedValue(item.percentageRate),
          timingDescription: extractedValue(item.timingDescription),
        })),
        notes: extractedValue(extraction.notes),
        paymentTermsRaw: extractedValue(extraction.paymentTerms.raw),
        reference,
        totalHt,
        totalTtc: extractedValue(extraction.totalTtc),
        vatAmount: extractedValue(extraction.vatAmount),
        vatRate: new Set(vatRates).size === 1 ? (vatRates[0] ?? null) : null,
        warnings,
      },
      provider: providerName,
    };
  } finally {
    file.bytes.fill(0);
  }
}

export type ProcessedClientDocumentReview = Awaited<
  ReturnType<typeof processClientDocument>
>;
