import "server-only";

import type {
  AiProcessingCapability,
  AiProcessingModels,
} from "@/config/ai-processing";
import type { AiProcessingSettingsInput } from "@/domain/settings/ai-processing";
import { COMPANY_REPORTING_CURRENCY_CODE } from "@/config/reporting";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";
import { getQuoteExtractionModel } from "@/lib/env/quote-extraction";
import { getItemExtractionModel } from "@/lib/env/item-extraction";
import { getClientDocumentExtractionModel } from "@/lib/env/client-document-extraction";

import {
  APPLICATION_SETTING_ID,
  DEFAULT_COMPANY_NAME,
} from "./application-settings";
const select = {
  quoteExtractionModel: true,
  itemExtractionModel: true,
  clientDocumentExtractionModel: true,
} as const;
const fallbacks = {
  quoteExtractionModel: getQuoteExtractionModel,
  itemExtractionModel: getItemExtractionModel,
  clientDocumentExtractionModel: getClientDocumentExtractionModel,
};

/** Read per request; a saved choice must take effect without a process restart. */
export async function getAiProcessingModel(
  capability: AiProcessingCapability,
): Promise<string> {
  const settings = await getDatabase().applicationSetting.findUnique({
    where: { id: APPLICATION_SETTING_ID },
    select,
  });
  return settings?.[capability] ?? fallbacks[capability]();
}

export async function getAiProcessingModels(): Promise<AiProcessingModels> {
  const settings = await getDatabase().applicationSetting.findUnique({
    where: { id: APPLICATION_SETTING_ID },
    select,
  });
  return {
    quoteExtractionModel:
      settings?.quoteExtractionModel ?? getQuoteExtractionModel(),
    itemExtractionModel:
      settings?.itemExtractionModel ?? getItemExtractionModel(),
    clientDocumentExtractionModel:
      settings?.clientDocumentExtractionModel ??
      getClientDocumentExtractionModel(),
  };
}

export async function updateAiProcessingSettings(
  actorId: string,
  input: AiProcessingSettingsInput,
): Promise<void> {
  await getDatabase().$transaction(async (transaction) => {
    const previous = await transaction.applicationSetting.findUnique({
      where: { id: APPLICATION_SETTING_ID },
      select,
    });
    await transaction.applicationSetting.upsert({
      where: { id: APPLICATION_SETTING_ID },
      create: {
        id: APPLICATION_SETTING_ID,
        companyName: DEFAULT_COMPANY_NAME,
        companyReportingCurrencyCode: COMPANY_REPORTING_CURRENCY_CODE,
        createdById: actorId,
        updatedById: actorId,
        ...input,
      },
      update: { ...input, updatedById: actorId },
    });
    await writeAuditEvent(transaction, actorId, {
      action: "UPDATED",
      entityId: APPLICATION_SETTING_ID,
      entityReference: "AI processing models",
      entityType: "SETTING",
      metadata: { before: previous, after: input },
      summary: "Updated the models used for AI processing.",
    });
  });
}
