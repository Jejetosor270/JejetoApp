import { beforeEach, describe, expect, it, vi } from "vitest";

const audit = vi.hoisted(() => ({ writeAuditEvent: vi.fn() }));
const transaction = vi.hoisted(() => ({
  applicationSetting: { upsert: vi.fn() },
}));
const database = vi.hoisted(() => ({
  applicationSetting: { findUnique: vi.fn() },
  item: { deleteMany: vi.fn() },
  $transaction: vi.fn(
    async (callback: (value: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/events", () => audit);
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));

import {
  getApplicationSettings,
  updateApplicationSettings,
  updateItemManagementSetting,
} from "@/lib/settings/application-settings";

describe("application settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the safe fixed reporting currency before a settings row exists", async () => {
    database.applicationSetting.findUnique.mockResolvedValue(null);

    await expect(getApplicationSettings()).resolves.toMatchObject({
      companyReportingCurrencyCode: "EUR",
      itemManagementEnabled: false,
    });
  });

  it("updates only the company name and audits the change", async () => {
    await updateApplicationSettings("actor-1", { companyName: "Example ERP" });

    expect(transaction.applicationSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          companyName: "Example ERP",
          companyReportingCurrencyCode: "EUR",
        }),
        update: {
          companyName: "Example ERP",
          updatedById: "actor-1",
        },
      }),
    );
    expect(audit.writeAuditEvent).toHaveBeenCalledWith(
      transaction,
      "actor-1",
      expect.objectContaining({ entityType: "SETTING" }),
    );
  });

  it("toggles only the Item Management Beta setting and audits it", async () => {
    await updateItemManagementSetting("actor-1", false);
    await updateItemManagementSetting("actor-1", true);

    expect(transaction.applicationSetting.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ itemManagementEnabled: true }),
        update: { itemManagementEnabled: true, updatedById: "actor-1" },
      }),
    );
    expect(audit.writeAuditEvent).toHaveBeenCalledWith(
      transaction,
      "actor-1",
      expect.objectContaining({
        entityType: "SETTING",
        metadata: { itemManagementEnabled: true },
      }),
    );
    expect(database.item.deleteMany).not.toHaveBeenCalled();
  });
});
