import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const table = readFileSync("src/components/billing/billing-table.tsx", "utf8");
const detail = readFileSync(
  "src/components/billing/billing-detail.tsx",
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

  it("routes Billing search results to the same detail page", () => {
    expect(search).toContain("href: `/billing/${document.id}`");
  });

  it("keeps the complete controlled draft when a save returns errors", () => {
    expect(detail).toContain("usePersistentActionState");
    expect(detail).toContain('if (state.status !== "success") return;');
    expect(detail).toContain("allocations: current.allocations.map");
    expect(detail).toContain("Save Billing Event");
  });
});
