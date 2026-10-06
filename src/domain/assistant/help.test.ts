import { describe, expect, it } from "vitest";
import {
  assistantHelpTopics,
  getAssistantHelp,
  type AssistantHelpEntry,
} from "./help";

function text(entry: AssistantHelpEntry): string {
  return [...entry.paragraphs, ...(entry.steps ?? [])].join(" ");
}

describe("curated JejetoBot help", () => {
  it("has the fixed topic allowlist", () => {
    expect(assistantHelpTopics).toEqual([
      "partial_payment",
      "mark_paid",
      "billing_allocation",
      "order_pricing",
      "vat_fx",
      "project_financials",
      "credits_refunds",
      "documents_import",
    ]);
  });

  it.each(assistantHelpTopics)("keeps %s links and labels bounded", (topic) => {
    const entry = getAssistantHelp(topic, "USER");
    expect(entry.title.split(/\s+/).length).toBeLessThanOrEqual(4);
    expect(entry.paragraphs.length).toBeGreaterThan(0);
    expect(entry.links.length).toBeGreaterThan(0);
    for (const link of entry.links) {
      expect(["/projects", "/orders", "/billing"]).toContain(link.href);
      expect(link.label.split(/\s+/).length).toBeLessThanOrEqual(4);
    }
    expect(text(entry)).toContain("JejetoBot is read-only");
    expect(text(entry)).toContain("Ask an ADMIN or MANAGER");
  });

  it.each(["ADMIN", "MANAGER"] as const)(
    "does not imply the %s can mutate through chat",
    (role) => {
      for (const topic of assistantHelpTopics) {
        const content = text(getAssistantHelp(topic, role));
        expect(content).toContain(
          "Operational changes require an ADMIN or MANAGER",
        );
        expect(content).toContain("cannot save changes");
      }
    },
  );

  it("distinguishes actual partial cash and the issued Invoice prerequisite", () => {
    const content = text(getAssistantHelp("partial_payment", "MANAGER"));
    expect(content).toContain("Supplier payments are money out");
    expect(content).toContain("Client receipts are money in");
    expect(content).toContain("Invoiced and save first");
    expect(content).toContain("More actions → Record partial payment");
    expect(content).toContain("actual FX");
  });

  it("describes Mark paid as actual full remaining cash, not status-only", () => {
    const content = text(getAssistantHelp("mark_paid", "MANAGER"));
    expect(content).toContain("full remaining balance as actual cash");
    expect(content).toContain("preserves earlier partial payments");
    expect(content).toContain("can save immediately");
    expect(content).toContain("first be saved as Invoiced");
    expect(content).toContain("Payment history");
  });

  it("keeps allocations separate from sell and cash with reviewed autofill", () => {
    const content = text(getAssistantHelp("billing_allocation", "USER"));
    expect(content).toContain("does not change the Order's selling price");
    expect(content).toContain("or record a payment");
    expect(content).toContain("same Project");
    expect(content).toContain("included portions");
    expect(content).toContain("capped at available Billing HT");
    expect(content).toContain("Missing manual FX leaves the proposal blank");
  });

  it("uses distinct markup and margin and never reschedules on a price change", () => {
    const content = text(getAssistantHelp("order_pricing", "USER"));
    expect(content).toContain("Markup is profit divided by cost");
    expect(content).toContain("margin is profit divided by selling revenue");
    expect(content).toContain("separately recharged freight added once");
    expect(content).toContain(
      "Existing scheduled amounts are never silently rewritten",
    );
  });

  it("retains independent VAT/FX and explicit missing-value semantics", () => {
    const content = text(getAssistantHelp("vat_fx", "USER"));
    expect(content).toContain("Output VAT is not revenue or profit");
    expect(content).toContain("non-deductible portion does");
    expect(content).toContain("including zero");
    expect(content).toContain("actual cash FX are independent");
    expect(content).toContain("reporting incomplete; it never means zero");
  });

  it("explains current Project coverage and cash without claiming final profit", () => {
    const content = text(getAssistantHelp("project_financials", "USER"));
    expect(content).toContain("not final or earned Project profit");
    expect(content).toContain(
      "issued Client Invoice HT after credits minus Order selling HT",
    );
    expect(content).toContain("Allocations do not limit this figure");
    expect(content).toContain("not a bank balance");
    expect(content).toContain("complete approved budget");
  });

  it("preserves credit/refund direction, selection and correction rules", () => {
    const content = text(getAssistantHelp("credits_refunds", "MANAGER"));
    expect(content).toContain("does not move cash");
    expect(content).toContain("preserving agreed Client selling prices");
    expect(content).toContain("Order allocations explicitly selected");
    expect(content).toContain("Supplier refund is money in");
    expect(content).toContain("Client refund is money out");
    expect(content).toContain(
      "correct active refunds before cancelling their credit",
    );
  });

  it("requires temporary import review and preserves existing records", () => {
    const content = text(getAssistantHelp("documents_import", "USER"));
    expect(content).toContain("Select the Project before uploading");
    expect(content).toContain("PDF, JPG/JPEG or PNG");
    expect(content).toContain("Client document. Upload a PDF");
    expect(content).toContain(
      "missing extracted fields must not replace saved values",
    );
    expect(content).toContain("not the source files or raw AI output");
    expect(content).toContain("save or close");
  });

  it("returns fresh arrays so one response cannot modify future help", () => {
    const entry = getAssistantHelp("partial_payment", "MANAGER");
    entry.paragraphs.push("changed");
    entry.steps?.push("changed");
    const link = entry.links[0];
    if (!link) throw new Error("Expected Purchasing help link");
    link.href = "/admin/users";
    const next = getAssistantHelp("partial_payment", "USER");
    expect(text(next)).not.toContain("changed");
    expect(next.links[0]?.href).toBe("/orders");
  });
});
