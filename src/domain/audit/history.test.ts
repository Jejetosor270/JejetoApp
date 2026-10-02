import { describe, expect, it } from "vitest";
import {
  auditEntityIdSchema,
  recordActivityHref,
  recordAuditChanges,
} from "./history";

describe("safe record history", () => {
  it("formats approved budget values and rates using each captured currency", () => {
    expect(
      recordAuditChanges("PROJECT", {
        before: {
          reportingCurrencyCode: "EUR",
          estimatedPurchaseCostHt: "100000",
          defaultProductMarkupRate: "0.15",
          freightEstimateNotes: "private note",
        },
        after: {
          reportingCurrencyCode: "USD",
          estimatedPurchaseCostHt: "120000",
          defaultProductMarkupRate: "0.2",
          freightEstimateNotes: "another note",
        },
      }),
    ).toEqual([
      {
        label: "Product purchase budget HT",
        before: "100 000.00 EUR",
        after: "120 000.00 USD",
      },
      { label: "Product markup", before: "15%", after: "20%" },
    ]);
  });
  it("supports safe inline cell before/after without guessing absent snapshots", () => {
    expect(
      recordAuditChanges("BILLING_DOCUMENT", {
        field: "dueDate",
        previous: "2026-10-01",
        value: "2026-10-15",
      }),
    ).toEqual([
      { label: "Due date", before: "01/10/2026", after: "15/10/2026" },
    ]);
    expect(
      recordAuditChanges("ORDER", {
        field: "shortDescription",
        previous: null,
        value: "Outdoor furniture",
      }),
    ).toEqual([
      {
        label: "Short description",
        before: "Not set",
        after: "Outdoor furniture",
      },
    ]);
    expect(
      recordAuditChanges("ORDER", { changedFields: ["status", "notes"] }),
    ).toEqual([]);
  });
  it.each([
    "password",
    "passwordHash",
    "accessToken",
    "notes",
    "rawExtraction",
    "__proto__",
    "constructor",
  ])("never surfaces arbitrary metadata field %s", (field) => {
    expect(
      recordAuditChanges("BILLING_DOCUMENT", {
        field,
        previous: "do-not-display",
        value: "also-private",
      }),
    ).toEqual([]);
  });
  it("rejects USER snapshots, nested payloads, invalid values and unchanged fields", () => {
    expect(
      recordAuditChanges("USER", {
        field: "reference",
        previous: "private",
        value: "changed",
      }),
    ).toEqual([]);
    expect(
      recordAuditChanges("PROJECT", {
        before: {
          expectedSellHt: "not-money",
          reference: { password: "private" },
          targetMode: "MARKUP",
        },
        after: {
          expectedSellHt: "100",
          reference: "reference",
          targetMode: "MARKUP",
        },
      }),
    ).toEqual([]);
    expect(
      recordAuditChanges("PROJECT", "raw JSON is not a supported snapshot"),
    ).toEqual([]);
  });
  it("validates exact-record links and bounded activity identifiers", () => {
    const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    expect(recordActivityHref("ORDER", id)).toBe(
      `/admin/activity?entityType=ORDER&entityId=${id}`,
    );
    expect(() => recordActivityHref("ORDER", "bad-id")).toThrow();
    expect(auditEntityIdSchema.parse("company")).toBe("company");
    expect(auditEntityIdSchema.safeParse("bad?id=other").success).toBe(false);
    expect(auditEntityIdSchema.safeParse("x".repeat(81)).success).toBe(false);
  });
  it.each([
    ["PROJECT", "Project status"],
    ["ORDER", "Delivery status"],
    ["BILLING_DOCUMENT", "Document status"],
  ])("labels %s status in the record's own context", (entityType, label) => {
    expect(
      recordAuditChanges(entityType, {
        field: "status",
        previous: "ACTIVE",
        value: "CANCELLED",
      }),
    ).toEqual([{ label, before: "Active", after: "Cancelled" }]);
  });
});
