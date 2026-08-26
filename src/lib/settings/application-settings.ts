import "server-only";

import { COMPANY_REPORTING_CURRENCY_CODE } from "@/config/reporting";
import type { ApplicationSettingsInput } from "@/domain/settings/validation";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";

const SETTING_ID = "company";
const DEFAULT_COMPANY_NAME = "Procurement Finance ERP";

export interface ApplicationSettingsView {
  companyName: string;
  companyReportingCurrencyCode: string;
}

export async function getApplicationSettings(): Promise<ApplicationSettingsView> {
  const settings = await getDatabase().applicationSetting.findUnique({
    where: { id: SETTING_ID },
    select: {
      companyName: true,
      companyReportingCurrencyCode: true,
    },
  });
  return (
    settings ?? {
      companyName: DEFAULT_COMPANY_NAME,
      companyReportingCurrencyCode: COMPANY_REPORTING_CURRENCY_CODE,
    }
  );
}

export async function updateApplicationSettings(
  actorId: string,
  input: ApplicationSettingsInput,
): Promise<void> {
  await getDatabase().$transaction(async (transaction) => {
    await transaction.applicationSetting.upsert({
      where: { id: SETTING_ID },
      create: {
        companyName: input.companyName,
        companyReportingCurrencyCode: COMPANY_REPORTING_CURRENCY_CODE,
        createdById: actorId,
        id: SETTING_ID,
        updatedById: actorId,
      },
      update: { companyName: input.companyName, updatedById: actorId },
    });
    await writeAuditEvent(transaction, actorId, {
      action: "UPDATED",
      entityId: SETTING_ID,
      entityReference: "Company settings",
      entityType: "SETTING",
      metadata: { changedFields: ["companyName"] },
      summary: "Updated the company display name.",
    });
  });
}
