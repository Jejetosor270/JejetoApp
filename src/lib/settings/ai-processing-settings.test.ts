import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_PROCESSING_CAPABILITIES } from "@/config/ai-processing";
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

  it("defaults every capability to GPT-6 Luna without a settings row", async () => {
    expect(await getAiProcessingModels()).toEqual({
      quoteExtractionModel: "gpt-6-luna",
      itemExtractionModel: "gpt-6-luna",
      clientDocumentExtractionModel: "gpt-6-luna",
    });
  });
  it("preserves independent environment defaults until a selection is saved", async () => {
    vi.stubEnv("QUOTE_EXTRACTION_MODEL", "supplier-model-id");
    vi.stubEnv("ITEM_EXTRACTION_MODEL", "gpt-6.1-sol");
    vi.stubEnv("CLIENT_DOCUMENT_EXTRACTION_MODEL", "client-model-id");
    database.applicationSetting.findUnique.mockResolvedValue({
      quoteExtractionModel: null,
      itemExtractionModel: null,
      clientDocumentExtractionModel: "gpt-6-luna",
    });
    expect(await getAiProcessingModels()).toEqual({
      quoteExtractionModel: "supplier-model-id",
      itemExtractionModel: "gpt-6.1-sol",
      clientDocumentExtractionModel: "gpt-6-luna",
    });
  });
  it.each(["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol"])(
    "normalizes saved %s on read without rewriting stored settings or audits",
    async (model) => {
      const saved = Object.freeze({
        quoteExtractionModel: model,
        itemExtractionModel: model,
        clientDocumentExtractionModel: model,
      });
      vi.stubEnv("QUOTE_EXTRACTION_MODEL", "gpt-6.1-sol");
      database.applicationSetting.findUnique.mockResolvedValue(saved);
      expect(await getAiProcessingModels()).toEqual({
        quoteExtractionModel: "gpt-6-luna",
        itemExtractionModel: "gpt-6-luna",
        clientDocumentExtractionModel: "gpt-6-luna",
      });
      for (const { field } of AI_PROCESSING_CAPABILITIES) {
        expect(await getAiProcessingModel(field)).toBe("gpt-6-luna");
        expect(saved[field]).toBe(model);
      }
      expect(database.$transaction).not.toHaveBeenCalled();
      expect(transaction.applicationSetting.upsert).not.toHaveBeenCalled();
      expect(audit.writeAuditEvent).not.toHaveBeenCalled();
    },
  );
  it.each(["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol"])(
    "normalizes retired environment default %s for every capability",
    async (model) => {
      vi.stubEnv("QUOTE_EXTRACTION_MODEL", model);
      vi.stubEnv("ITEM_EXTRACTION_MODEL", model);
      vi.stubEnv("CLIENT_DOCUMENT_EXTRACTION_MODEL", model);
      expect(await getAiProcessingModels()).toEqual({
        quoteExtractionModel: "gpt-6-luna",
        itemExtractionModel: "gpt-6-luna",
        clientDocumentExtractionModel: "gpt-6-luna",
      });
      for (const { field } of AI_PROCESSING_CAPABILITIES) {
        expect(await getAiProcessingModel(field)).toBe("gpt-6-luna");
      }
    },
  );
  it.each(AI_PROCESSING_CAPABILITIES)(
    "reads the saved $field choice on every request and overrides invalid environment defaults",
    async ({ field }) => {
      vi.stubEnv("QUOTE_EXTRACTION_MODEL", "invalid model");
      vi.stubEnv("ITEM_EXTRACTION_MODEL", "invalid model");
      vi.stubEnv("CLIENT_DOCUMENT_EXTRACTION_MODEL", "invalid model");
      database.applicationSetting.findUnique
        .mockResolvedValueOnce({ [field]: "gpt-6.1-sol" })
        .mockResolvedValueOnce({ [field]: "gpt-6-luna" });
      expect(await getAiProcessingModel(field)).toBe("gpt-6.1-sol");
      expect(await getAiProcessingModel(field)).toBe("gpt-6-luna");
      expect(database.applicationSetting.findUnique).toHaveBeenCalledTimes(2);
    },
  );
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
      quoteExtractionModel: "gpt-6.1-sol",
      itemExtractionModel: "gpt-6-luna",
      clientDocumentExtractionModel: "gpt-6.1-sol",
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
