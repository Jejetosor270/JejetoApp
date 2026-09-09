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

describe("Billing operational navigation", () => {
  it("opens the successful intake record instead of linking back to the current Billing list", () => {
    const intake = readFileSync(
      "src/components/billing/client-document-intake.tsx",
      "utf8",
    );
    expect(intake).toContain("href={`/billing/${state.recordId}`}");
    expect(intake).not.toContain('<Link href="/billing">');
    const orderRoute = readFileSync(
      "src/app/(app)/orders/import/page.tsx",
      "utf8",
    );
    const panel = readFileSync(
      "src/components/quote-intake/order-intake-panel.tsx",
      "utf8",
    );
    expect(orderRoute).toContain("<OrderIntakePanel");
    expect(panel).toContain("<EditorDrawer");
    expect(panel).toContain("<QuoteIntake options={options}");
  });
  it("opens table rows and edits table fields inline", () => {
    expect(table).toContain("router.push(href)");
    expect(table).toContain(
      'target.closest("a, button, input, select, textarea, form")',
    );
    expect(table).toContain("<InlineEditActions");
    expect(table).toContain("updateClientBillingInlineAction(data)");
    expect(route).toContain('startEditing={query.edit === "1"}');
  });

  it("keeps all installment and receipt management out of Billing rows", () => {
    expect(table).not.toContain("paymentInstallments");
    expect(table).not.toContain("BillingScheduleManager");
    expect(table).not.toContain("Record receipt");
    expect(table).not.toContain("Manage schedule and receipts");
    expect(table).not.toContain("<form");
  });

  it("keeps payment management under Related and cash totals under Details", () => {
    expect(detail).toMatch(/id: "schedule",\s*group: "related"/);
    expect(detail).toMatch(/id: "history",[\s\S]*?group: "related"/);
    expect(detail).toContain('label: "Total TTC"');
    expect(detail).toContain("RecordWorkspace");
    expect(paymentManager).toContain("Client payment terms");
    expect(detail).toContain('label: "Received"');
    expect(paymentManager).not.toContain('label="Received TTC"');
    expect(detail).toContain('label: "Outstanding"');
    expect(paymentManager).toContain("RelatedCashCreate");
    expect(paymentManager).toContain("TermPaymentActions");
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
    expect(
      readFileSync("src/components/payments/related-cash-create.tsx", "utf8"),
    ).toContain("value={amount}");
  });
});
