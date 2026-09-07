import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
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
    client: { findMany: mocks.projects },
    clientBillingDocument: { findMany: mocks.projects },
  }),
}));
vi.mock("./supplier-page", () => ({
  default: () => createElement("p", null, "Supplier installments"),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/payments",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  redirect: (url: string) => {
    throw new Error("redirect:" + url);
  },
}));
vi.mock("@/lib/billing/reporting", () => ({
  listClientCashInstallments: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/components/payments/receipt-entry", () => ({
  ReceiptEntry: () => createElement("button", null, "Record Payment"),
}));
import PaymentsPage from "./page";
import { CreateOrderActions } from "@/components/procurement/create-order-actions";
beforeEach(() => {
  mocks.user.mockResolvedValue({ role: "MANAGER" });
});
it.each(["supplier", "client", "entry"])(
  "offers exactly three operational tabs on %s",
  async (tab) => {
    const html = renderToStaticMarkup(
      await PaymentsPage({ searchParams: Promise.resolve({ tab }) }),
    );
    const nav =
      html.match(/<nav aria-label="Payments sections"[\s\S]*?<\/nav>/)?.[0] ??
      "";
    expect(nav.match(/<a /g)).toHaveLength(3);
    for (const label of ["Supplier", "Client", "Record Payment"])
      expect(nav).toContain(label);
    expect(html).not.toMatch(/Overview|Transactions|tab=receipts/);
    expect(html.match(/<h1 /g)).toHaveLength(1);
    expect(html.indexOf("<h1 ")).toBeLessThan(
      html.indexOf('<nav aria-label="Payments sections"'),
    );
    expect(html).toContain(
      tab === "supplier"
        ? "Supplier installments"
        : tab === "client"
          ? "Billing schedules"
          : "<button>Record Payment",
    );
    expect(
      renderToStaticMarkup(<CreateOrderActions>form</CreateOrderActions>),
    ).toContain("New Order");
  },
);
it("keeps the entry action unavailable to read-only employees", async () => {
  mocks.user.mockResolvedValue({ role: "USER" });
  const html = renderToStaticMarkup(
    await PaymentsPage({ searchParams: Promise.resolve({ tab: "entry" }) }),
  );
  expect(html).not.toContain("<button>Record Payment");
  expect(html).toContain("ADMIN or MANAGER");
});
it.each([undefined, "unknown"])("defaults to Supplier for %s", async (tab) => {
  const html = renderToStaticMarkup(
    await PaymentsPage({ searchParams: Promise.resolve({ tab }) }),
  );
  expect(html).toContain("Supplier installments");
});
it.each([
  ["overview", undefined, "supplier"],
  ["transactions", undefined, "supplier"],
  ["transactions", "OUT", "supplier"],
  ["transactions", "IN", "client"],
  ["receipts", undefined, "entry"],
])("redirects legacy %s / %s safely", async (tab, direction, target) => {
  await expect(
    PaymentsPage({
      searchParams: Promise.resolve({
        tab,
        direction,
        projectId: "project",
        page: "4",
      }),
    }),
  ).rejects.toThrow(`redirect:/payments?tab=${target}&projectId=project`);
});
it("redirects a Billing-specific transaction link to Client", async () => {
  await expect(
    PaymentsPage({
      searchParams: Promise.resolve({
        tab: "transactions",
        billingId: "billing",
      }),
    }),
  ).rejects.toThrow("redirect:/payments?tab=client&billingId=billing");
});
