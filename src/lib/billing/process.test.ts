import { describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";

import type { ClientDocumentExtractionProvider } from "./provider";
import { clientDocumentExtractionFixture } from "@/test/client-document-extraction-fixture";

const database = vi.hoisted(() => ({
  client: { findMany: vi.fn() },
  clientBillingDocument: { findMany: vi.fn() },
  project: { findMany: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));

import { processClientDocument } from "./process";

describe("temporary Client document processing", () => {
  it("proposes matches and warnings without persisting the PDF", async () => {
    database.client.findMany.mockResolvedValue([
      {
        displayName: "Example Client",
        id: "client-1",
        legalName: "Example Client SAS",
      },
    ]);
    database.project.findMany.mockResolvedValue([
      {
        clientId: "client-1",
        code: "DEMO-001",
        id: "project-1",
        name: "Demo Project",
      },
    ]);
    database.clientBillingDocument.findMany.mockResolvedValue([
      {
        clientId: "client-1",
        documentDate: new Date("2026-09-01T00:00:00.000Z"),
        documentType: "INVOICE",
        id: "document-1",
        projectId: "project-1",
        reference: "INV-2026-014",
        totalHt: new Decimal("100000"),
      },
    ]);
    const extraction = clientDocumentExtractionFixture();
    extraction.vatLines.push({
      amount: { diagnostic: null, status: "EXTRACTED", value: "50" },
      label: { diagnostic: null, status: "EXTRACTED", value: "VAT 10%" },
      rate: { diagnostic: null, status: "EXTRACTED", value: "0.10" },
      taxableBase: { diagnostic: null, status: "EXTRACTED", value: "500" },
    });
    let requestBytes: Uint8Array | null = null;
    const provider: ClientDocumentExtractionProvider = {
      extract: vi.fn(async (file) => {
        requestBytes = file.bytes;
        return { extraction, model: "mock-model", provider: "mock" };
      }),
    };
    const file = new File(
      [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])],
      "invoice.pdf",
      { type: "application/pdf" },
    );

    const result = await processClientDocument(file, provider);

    expect(provider.extract).toHaveBeenCalledTimes(1);
    expect(requestBytes ? [...requestBytes] : null).toEqual([0, 0, 0, 0, 0, 0]);
    expect(result).toMatchObject({
      clientSuggestionId: "client-1",
      projectSuggestionId: "project-1",
      proposal: { vatRate: null },
    });
    expect(result.duplicateCandidates[0]?.reasons).toEqual(
      expect.arrayContaining([
        "same document number",
        "same date",
        "same amount",
      ]),
    );
    expect(result.proposal.warnings).toContainEqual(
      expect.stringContaining("Multiple VAT rates"),
    );
    expect(JSON.stringify(result)).not.toContain("base64");
  });

  it("does not suggest an ambiguous Project", async () => {
    database.client.findMany.mockResolvedValue([]);
    database.project.findMany.mockResolvedValue([
      { clientId: "one", code: "DEMO-001", id: "project-1", name: "One" },
      { clientId: "two", code: "DEMO-001", id: "project-2", name: "Two" },
    ]);
    database.clientBillingDocument.findMany.mockResolvedValue([]);
    const provider: ClientDocumentExtractionProvider = {
      extract: vi.fn(async () => ({
        extraction: clientDocumentExtractionFixture(),
        model: "mock-model",
        provider: "mock",
      })),
    };
    const file = new File(
      [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])],
      "quote.pdf",
      { type: "application/pdf" },
    );

    await expect(processClientDocument(file, provider)).resolves.toMatchObject({
      clientSuggestionId: null,
      projectSuggestionId: null,
    });
  });
});
