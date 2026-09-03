import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const clientList = readFileSync(
  "src/app/(app)/clients/client-management.tsx",
  "utf8",
);
const supplierList = readFileSync(
  "src/app/(app)/suppliers/supplier-management.tsx",
  "utf8",
);
const clientDetail = readFileSync(
  "src/app/(app)/clients/[clientId]/page.tsx",
  "utf8",
);
const supplierDetail = readFileSync(
  "src/app/(app)/suppliers/[supplierId]/page.tsx",
  "utf8",
);

describe("Phase 11.12 Directory structure", () => {
  it("provides clickable Client and Supplier rows", () => {
    expect(clientList).toContain("router.push(`/clients/${client.id}`)");
    expect(supplierList).toContain("router.push(`/suppliers/${supplier.id}`)");
  });

  it("provides full detail editing and operational sections", () => {
    expect(clientDetail).toContain("ClientDetailEditor");
    expect(clientDetail).toContain("Billing & collection summary");
    expect(clientDetail).toContain("Activity");
    expect(supplierDetail).toContain("SupplierDetailEditor");
    expect(supplierDetail).toContain("Orders");
    expect(supplierDetail).toContain("Payments");
    expect(supplierDetail).toContain("Activity");
  });
});
