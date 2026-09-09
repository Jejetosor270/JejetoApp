import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./cash-record-editor", () => ({
  cashRecordEditor: async () => createElement("button", null, "Edit"),
}));
const mock = vi.hoisted(() => ({ user: vi.fn(), record: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: mock.user,
  canEditMasterData: (role: string) => role !== "USER",
}));
vi.mock("@/lib/related-records/cash-records", () => ({
  getCashRecord: mock.record,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("tab=related"),
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => {
    throw new Error("Not found");
  },
}));
import { CashRecordPage } from "./cash-record-page";

beforeEach(() => {
  vi.resetAllMocks();
  mock.user.mockResolvedValue({ role: "USER" });
  mock.record.mockResolvedValue({
    title: "Deposit",
    type: "Client installment",
    status: "UPCOMING",
    description: "Scheduled cash",
    manageHref: "/billing/document?tab=schedule",
    fields: [{ label: "Scheduled TTC", value: "100.00 EUR" }],
    tables: [
      {
        id: "billing",
        title: "Billing",
        description: "Owning document",
        columns: ["Reference"],
        rows: [
          {
            id: "document",
            href: "/billing/document?tab=related",
            cells: ["INV1"],
          },
        ],
      },
    ],
  });
});
it.each([
  "payment",
  "receipt",
  "supplier-installment",
  "client-installment",
] as const)(
  "renders a %s page with both tabs and connected records for USER",
  async (kind) => {
    const html = renderToStaticMarkup(
      await CashRecordPage({ kind, id: "record" }),
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("100.00 EUR");
    expect(html).toContain("/billing/document?tab=related");
    expect(html).not.toContain("Manage in");
    expect(mock.record).toHaveBeenCalledWith(kind, "record");
  },
);
it("offers an authorized local editor and handles missing records", async () => {
  mock.user.mockResolvedValue({ role: "MANAGER" });
  expect(
    renderToStaticMarkup(
      await CashRecordPage({ kind: "receipt", id: "record" }),
    ),
  ).toContain("<button>Edit</button>");
  mock.record.mockResolvedValue(null);
  await expect(
    CashRecordPage({ kind: "receipt", id: "missing" }),
  ).rejects.toThrow("Not found");
});

vi.mock("@/app/(app)/related-records/actions", () => ({
  editRelatedNameAction: vi.fn(),
  removeOptionalLinksAction: vi.fn(),
}));
vi.mock("@/app/(app)/unassigned-cash/actions", () => ({
  unassignCashAction: vi.fn(),
}));
