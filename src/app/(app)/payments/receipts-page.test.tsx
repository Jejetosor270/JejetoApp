import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  projects: vi.fn().mockResolvedValue([]),
  currencies: vi.fn().mockResolvedValue([]),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: mocks.user,
  canEditMasterData: (role: string) => role !== "USER",
}));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({
    project: { findMany: mocks.projects },
    currency: { findMany: mocks.currencies },
  }),
}));
vi.mock("./supplier-page", () => ({ default: () => null }));
vi.mock("@/components/payments/receipt-entry", () => ({
  ReceiptEntry: () => createElement("button", null, "Record receipt"),
}));
import PaymentsPage from "./page";
import { CreateOrderActions } from "@/components/procurement/create-order-actions";
it("offers the Receipts entry tab alongside Transactions and preserves entity terminology", async () => {
  mocks.user.mockResolvedValue({ role: "MANAGER" });
  const html = renderToStaticMarkup(
    await PaymentsPage({ searchParams: Promise.resolve({ tab: "receipts" }) }),
  );
  expect(html).toContain('href="/payments?tab=receipts"');
  expect(html).toContain("Record receipt");
  expect(html).toContain("Transactions");
  expect(
    renderToStaticMarkup(<CreateOrderActions>form</CreateOrderActions>),
  ).toContain("New Order");
});
it("keeps the entry action unavailable to read-only employees", async () => {
  mocks.user.mockResolvedValue({ role: "USER" });
  const html = renderToStaticMarkup(
    await PaymentsPage({ searchParams: Promise.resolve({ tab: "receipts" }) }),
  );
  expect(html).not.toContain("<button>Record receipt");
  expect(html).toContain("ADMIN or MANAGER");
});
