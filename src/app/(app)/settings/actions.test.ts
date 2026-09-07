import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  requireMasterDataEditor: vi.fn(),
  requireAdmin: vi.fn(),
}));
const settings = vi.hoisted(() => ({ updateAiProcessingSettings: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => auth);
vi.mock("@/lib/settings/ai-processing-settings", () => settings);
vi.mock("@/lib/settings/application-settings", () => ({
  updateApplicationSettings: vi.fn(),
  updateItemManagementSetting: vi.fn(),
}));
import { updateAiProcessingSettingsAction } from "./actions";

describe("AI settings authorization and validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireMasterDataEditor.mockResolvedValue({ id: "server-actor" });
  });
  it("rejects unauthorized callers before saving", async () => {
    auth.requireMasterDataEditor.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(
      updateAiProcessingSettingsAction({}, new FormData()),
    ).rejects.toThrow("Forbidden");
    expect(settings.updateAiProcessingSettings).not.toHaveBeenCalled();
  });
  it("returns field errors for unsupported or missing model choices", async () => {
    const result = await updateAiProcessingSettingsAction({}, new FormData());
    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        quoteExtractionModel: expect.any(String),
        itemExtractionModel: expect.any(String),
        clientDocumentExtractionModel: expect.any(String),
      },
    });
    expect(settings.updateAiProcessingSettings).not.toHaveBeenCalled();
  });
  it("uses the server actor and ignores unrelated settings submitted by the browser", async () => {
    const data = new FormData();
    data.set("quoteExtractionModel", "gpt-5.6-terra");
    data.set("itemExtractionModel", "gpt-5.6-luna");
    data.set("clientDocumentExtractionModel", "gpt-5.6-sol");
    data.set("actorId", "forged-actor");
    data.set("companyReportingCurrencyCode", "USD");
    expect(await updateAiProcessingSettingsAction({}, data)).toMatchObject({
      status: "success",
    });
    expect(settings.updateAiProcessingSettings).toHaveBeenCalledWith(
      "server-actor",
      {
        quoteExtractionModel: "gpt-5.6-terra",
        itemExtractionModel: "gpt-5.6-luna",
        clientDocumentExtractionModel: "gpt-5.6-sol",
      },
    );
  });
});
