import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const transaction = vi.hoisted(() => ({
  applicationSetting: { findUnique: vi.fn(), upsert: vi.fn() },
}));
const database = vi.hoisted(() => ({
  applicationSetting: { findUnique: vi.fn() },
  $transaction: vi.fn(
    async (callback: (value: typeof transaction) => Promise<void>) =>
      callback(transaction),
  ),
}));
const audit = vi.hoisted(() => ({ writeAuditEvent: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));
vi.mock("@/lib/audit/events", () => audit);
import {
  getAiProcessingModel,
  getAiProcessingModels,
  updateAiProcessingSettings,
} from "./ai-processing-settings";

describe("saved AI processing settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.applicationSetting.findUnique.mockResolvedValue(null);
    for (const name of [
      "QUOTE_EXTRACTION_MODEL",
      "ITEM_EXTRACTION_MODEL",
      "CLIENT_DOCUMENT_EXTRACTION_MODEL",
    ])
      vi.stubEnv(name, "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to Luna without a settings row", async () => {
    expect(await getAiProcessingModels()).toEqual({
      quoteExtractionModel: "gpt-5.6-luna",
      itemExtractionModel: "gpt-5.6-luna",
      clientDocumentExtractionModel: "gpt-5.6-luna",
    });
  });
  it("preserves independent environment defaults until a selection is saved", async () => {
    vi.stubEnv("QUOTE_EXTRACTION_MODEL", "gpt-5.6-terra");
    vi.stubEnv("ITEM_EXTRACTION_MODEL", "gpt-5.6-sol");
    database.applicationSetting.findUnique.mockResolvedValue({
      quoteExtractionModel: null,
      itemExtractionModel: null,
      clientDocumentExtractionModel: "gpt-5.6-terra",
    });
    expect(await getAiProcessingModels()).toEqual({
      quoteExtractionModel: "gpt-5.6-terra",
      itemExtractionModel: "gpt-5.6-sol",
      clientDocumentExtractionModel: "gpt-5.6-terra",
    });
  });
  it("reads the saved choice for every new request and overrides even an invalid environment model", async () => {
    vi.stubEnv("QUOTE_EXTRACTION_MODEL", "invalid model");
    database.applicationSetting.findUnique
      .mockResolvedValueOnce({ quoteExtractionModel: "gpt-5.6-sol" })
      .mockResolvedValueOnce({ quoteExtractionModel: "gpt-5.6-terra" });
    expect(await getAiProcessingModel("quoteExtractionModel")).toBe(
      "gpt-5.6-sol",
    );
    expect(await getAiProcessingModel("quoteExtractionModel")).toBe(
      "gpt-5.6-terra",
    );
  });
  it("does not silently use a different model when settings cannot be read", async () => {
    database.applicationSetting.findUnique.mockRejectedValueOnce(
      new Error("Database unavailable"),
    );
    await expect(getAiProcessingModel("itemExtractionModel")).rejects.toThrow(
      "Database unavailable",
    );
  });
  it("updates only model choices with actor attribution and a transactional audit", async () => {
    const input = {
      quoteExtractionModel: "gpt-5.6-sol",
      itemExtractionModel: "gpt-5.6-luna",
      clientDocumentExtractionModel: "gpt-5.6-terra",
    } as const;
    transaction.applicationSetting.findUnique.mockResolvedValue(null);
    await updateAiProcessingSettings("actor-id", input);
    expect(database.$transaction).toHaveBeenCalledOnce();
    expect(transaction.applicationSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { ...input, updatedById: "actor-id" },
        create: expect.objectContaining({ ...input, createdById: "actor-id" }),
      }),
    );
    expect(audit.writeAuditEvent).toHaveBeenCalledWith(
      transaction,
      "actor-id",
      expect.objectContaining({
        entityType: "SETTING",
        metadata: { before: null, after: input },
      }),
    );
  });
});
