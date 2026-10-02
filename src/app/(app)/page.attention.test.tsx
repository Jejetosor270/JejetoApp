import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AttentionRow } from "@/components/reporting/financial-attention-table";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  workspace: vi.fn(),
  followUps: vi.fn(),
  snoozes: vi.fn(),
  employees: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: mocks.user,
  canEditMasterData: (role: string) => role !== "USER",
}));
vi.mock("@/lib/reporting/attention-workspace", () => ({
  getAttentionWorkspace: mocks.workspace,
}));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({
    financialFollowUp: { findMany: mocks.followUps },
    financialAttentionSnooze: { findMany: mocks.snoozes },
    user: { findMany: mocks.employees },
  }),
}));
vi.mock("@/components/reporting/financial-attention-table", () => ({
  FinancialAttentionTable: ({
    rows,
    canEdit,
  }: {
    rows: AttentionRow[];
    canEdit: boolean;
  }) => (
    <div data-can-edit={String(canEdit)}>
      {rows.map((row) => (
        <p key={row.key}>
          {row.title}: {row.followUp?.assigneeName ?? "Unassigned"}
        </p>
      ))}
    </div>
  ),
}));
vi.mock("@/domain/payments/dates", async (original) => ({
  ...(await original<typeof import("@/domain/payments/dates")>()),
  businessToday: () => "2026-10-02",
}));
import Home from "./page";
const id = "00000000-0000-4000-8000-000000000001";
const row = {
  fingerprint: "a".repeat(64),
  key: `document-fx:${id}`,
  title: "Missing FX",
  detail: "Review FX",
  priority: "Incomplete",
  projectId: id,
  projectName: "Villa",
  reference: "Invoice",
  href: "/billing/invoice",
  amount: null,
  currency: "EUR",
  basis: null,
  date: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "employee", role: "MANAGER" });
  mocks.workspace.mockResolvedValue({
    projects: [],
    issues: [
      row,
      { ...row, key: `cash-gap-90:${id}`, title: "Cash gap" },
      { ...row, key: `unassigned-cash:${id}`, title: "Unassigned cash" },
    ],
  });
  mocks.followUps.mockResolvedValue([
    {
      issueKey: row.key,
      version: 1,
      assigneeId: "employee",
      assignee: { name: "Alex" },
      nextFollowUpDate: null,
      note: "",
    },
    {
      issueKey: `cash-gap:${id}`,
      version: 2,
      assigneeId: "employee",
      assignee: { name: "Alex" },
      nextFollowUpDate: null,
      note: "",
    },
  ]);
  mocks.snoozes.mockResolvedValue([]);
  mocks.employees.mockResolvedValue([]);
});
it("filters data quality and owner together and preserves them across horizon links", async () => {
  const html = renderToStaticMarkup(
    await Home({
      searchParams: Promise.resolve({
        horizon: "90",
        owner: "mine",
        scope: "data-quality",
        pageSize: "50",
      }),
    }),
  );
  expect(html).toContain("Missing FX: Alex");
  expect(html).not.toContain("Cash gap: Alex");
  expect(html).not.toContain("Unassigned cash: Unassigned");
  expect(html).toContain(
    "horizon=7&amp;attention=active&amp;owner=mine&amp;scope=data-quality&amp;pageSize=50",
  );
  expect(html).toContain('data-can-edit="true"');
});
it("keeps shared ownership independent of personal snoozes and canonicalizes horizon identities", async () => {
  mocks.snoozes.mockResolvedValue([
    {
      issueKey: row.key,
      fingerprint: row.fingerprint,
      until: new Date("2026-10-10"),
      reason: "Awaiting rate",
    },
  ]);
  const html = renderToStaticMarkup(
    await Home({
      searchParams: Promise.resolve({
        horizon: "90",
        owner: "mine",
        attention: "snoozed",
      }),
    }),
  );
  expect(html).toContain("Missing FX: Alex");
  expect(html).not.toContain("Cash gap: Alex");
  expect(mocks.followUps).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        issueKey: { in: [row.key, `cash-gap:${id}`, `unassigned-cash:${id}`] },
      },
    }),
  );
  expect(html).toContain("horizon=30&amp;attention=snoozed&amp;owner=mine");
});
it("shows unassigned review items to USER without loading edit options", async () => {
  mocks.user.mockResolvedValue({ id: "employee", role: "USER" });
  const html = renderToStaticMarkup(
    await Home({ searchParams: Promise.resolve({ owner: "unassigned" }) }),
  );
  expect(html).toContain("Unassigned cash: Unassigned");
  expect(html).not.toContain("Missing FX: Alex");
  expect(html).toContain('data-can-edit="false"');
  expect(mocks.employees).not.toHaveBeenCalled();
});
