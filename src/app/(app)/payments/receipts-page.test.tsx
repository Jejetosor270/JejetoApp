import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), list: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: mocks.user,
  canEditMasterData: (role: string) => role !== "USER",
}));
vi.mock("@/lib/db", () => ({
  getDatabase: () =>
    Object.fromEntries(
      ["project", "currency", "client", "supplier"].map((name) => [
        name,
        { findMany: async () => [] },
      ]),
    ),
}));
vi.mock("@/lib/payments/cash-list", () => ({
  listCashRecords: mocks.list,
  installmentStatuses: ["OVERDUE", "UPCOMING", "PAID"],
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/payments",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  redirect: (url: string) => {
    throw new Error("redirect:" + url);
  },
}));
vi.mock("@/components/payments/receipt-entry", () => ({
  ReceiptEntry: () => createElement("button", null, "Record cash"),
}));
import PaymentsPage from "./page";
import ReceiptsPage from "../receipts/page";
import InstallmentsPage from "../installments/page";
beforeEach(() => {
  mocks.user.mockResolvedValue({ role: "MANAGER" });
  mocks.list.mockResolvedValue({ items: [], total: 0 });
});
it.each([
  [PaymentsPage, "payment", "Payments"],
  [ReceiptsPage, "receipt", "Receipts"],
  [InstallmentsPage, "supplier-installment", "Installments"],
] as const)(
  "uses the shared operational workspace for %s",
  async (Page, kind, title) => {
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain(`aria-label="${title}"`);
    expect(html).toContain("Select all visible rows");
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind, page: 1, pageSize: 25 }),
    );
    expect(html.match(/<h1 /g)).toHaveLength(1);
  },
);
it("offers separate Client and Supplier installment tabs", async () => {
  const html = renderToStaticMarkup(
    await InstallmentsPage({
      searchParams: Promise.resolve({ tab: "client" }),
    }),
  );
  expect(html).toContain('aria-label="Installment type"');
  expect(html).toContain("Supplier");
  expect(html).toContain("Client");
  expect(mocks.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ kind: "client-installment" }),
  );
});
it("hides entry and deletion for read-only employees", async () => {
  mocks.user.mockResolvedValue({ role: "USER" });
  const html = renderToStaticMarkup(
    await PaymentsPage({ searchParams: Promise.resolve({}) }),
  );
  expect(html).not.toContain("Record cash");
  expect(html).not.toContain("Select all visible rows");
});
it("preserves client schedule links", async () => {
  await expect(
    PaymentsPage({
      searchParams: Promise.resolve({ tab: "client", projectId: "project" }),
    }),
  ).rejects.toThrow("redirect:/installments?tab=client&projectId=project");
});
it.each([
  ["transactions", "IN", "/receipts?projectId=project"],
  ["transactions", "OUT", "/payments?projectId=project"],
  ["receipts", undefined, "/receipts?projectId=project&tab=entry"],
] as const)(
  "redirects historical %s links without losing scope",
  async (tab, direction, target) => {
    await expect(
      PaymentsPage({
        searchParams: Promise.resolve({
          tab,
          direction,
          projectId: "project",
          page: "4",
        }),
      }),
    ).rejects.toThrow("redirect:" + target);
  },
);
