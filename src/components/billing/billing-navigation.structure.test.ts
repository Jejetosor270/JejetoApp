import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const table = readFileSync("src/components/billing/billing-table.tsx", "utf8");
const detail = readFileSync(
  "src/components/billing/billing-detail.tsx",
  "utf8",
);
const paymentManager = readFileSync(
  "src/components/billing/billing-schedule-manager.tsx",
  "utf8",
);
const receiptEditor = readFileSync(
  "src/components/billing/billing-receipt-editor.tsx",
  "utf8",
);
const route = readFileSync(
  "src/app/(app)/billing/[billingId]/page.tsx",
  "utf8",
);
const search = readFileSync("src/lib/search/global-search.ts", "utf8");

describe("Client Billing operational navigation", () => {
  it("opens table rows and sends Edit directly to detail edit mode", () => {
    expect(table).toContain("router.push(href)");
    expect(table).toContain(
      'target.closest("a, button, input, select, textarea, form")',
    );
    expect(table).toContain("href={`${href}?edit=1`}");
    expect(route).toContain('startEditing={query.edit === "1"}');
  });

  it("keeps all installment and receipt management out of Billing rows", () => {
    expect(table).not.toContain("paymentInstallments");
    expect(table).not.toContain("BillingScheduleManager");
    expect(table).not.toContain("Record receipt");
    expect(table).not.toContain("Manage schedule and receipts");
    expect(table).not.toContain("<form");
  });

  it("keeps the grouped payment manager at the bottom of Billing detail", () => {
    expect(detail.lastIndexOf("BillingScheduleManager")).toBeGreaterThan(
      detail.lastIndexOf("Import metadata"),
    );
    expect(paymentManager).toContain("Document TTC");
    expect(paymentManager).toContain("Scheduled TTC");
    expect(paymentManager).toContain("Received TTC");
    expect(paymentManager).toContain("Outstanding TTC");
    expect(paymentManager).toContain("Add installment");
    expect(paymentManager).toContain("Record receipt");
  });

  it("routes Billing search results to the same detail page", () => {
    expect(search).toContain("href: `/billing/${document.id}`");
  });

  it("keeps the complete controlled draft when a save returns errors", () => {
    expect(detail).toContain("usePersistentActionState");
    expect(detail).toContain('if (state.status !== "success") return;');
    expect(detail).toContain("allocations: current.allocations.map");
    expect(detail).toContain("Save Billing Event");
    expect(receiptEditor).toContain("usePersistentActionState");
    expect(receiptEditor).toContain('if (state.status !== "success") return;');
    expect(receiptEditor).toContain("value={draft.amount}");
    expect(paymentManager).toContain("value={receiptAmount}");
  });
});
