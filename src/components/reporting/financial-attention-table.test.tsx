// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { mountForm, enter, clickText, control } from "@/test/dom-form";
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  restore: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/app/(app)/attention-actions", () => ({
  snoozeAttention: mocks.save,
  unsnoozeAttention: mocks.restore,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
import {
  FinancialAttentionTable,
  type AttentionRow,
} from "./financial-attention-table";
const row: AttentionRow = {
  key: "term-due:00000000-0000-4000-8000-000000000001",
  fingerprint: "a".repeat(64),
  priority: "Overdue",
  title: "Supplier payment due",
  detail: "Remaining after payments",
  projectId: "project",
  projectName: "Villa",
  reference: "REF-1",
  href: "/orders/order",
  amount: "1234.56",
  currency: "EUR",
  basis: "TTC",
  date: "2026-09-20",
  snooze: null,
};
let view: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => {
  await view?.unmount();
  vi.clearAllMocks();
});
it("opens records, formats amounts/dates and preserves a rejected snooze draft", async () => {
  mocks.save.mockResolvedValue({ ok: false, message: "Please try again" });
  view = await mountForm(
    <FinancialAttentionTable
      rows={[row]}
      today="2026-09-22"
      horizon={30}
      snoozed={false}
    />,
  );
  expect(document.querySelector("a")?.getAttribute("href")).toBe(
    "/orders/order",
  );
  expect(document.body.textContent).toContain("20/09/2026");
  expect(document.body.textContent).toContain("EUR");
  expect(document.body.textContent).toContain("TTC");
  expect(document.querySelector('[data-slot="badge"]')?.className).toContain(
    "text-destructive",
  );
  expect(document.querySelector("td.financial-figure")?.className).toContain(
    "text-right",
  );
  await clickText("Snooze");
  await enter("reason", "Waiting for approval");
  await act(async () => {
    document
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({
      key: row.key,
      horizon: 30,
      reason: "Waiting for approval",
      until: "2026-09-29",
    }),
  );
  expect(control("reason").value).toBe("Waiting for approval");
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    "Please try again",
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("shows snooze reason and lets the employee restore the reminder", async () => {
  mocks.restore.mockResolvedValue({ ok: true, message: "Restored" });
  view = await mountForm(
    <FinancialAttentionTable
      rows={[{ ...row, snooze: { until: "2026-09-30", reason: "Waiting" } }]}
      today="2026-09-22"
      horizon={7}
      snoozed
    />,
  );
  expect(document.body.textContent).toContain(
    "Snoozed until 30/09/2026 · Waiting",
  );
  await clickText("Unsnooze");
  expect(mocks.restore).toHaveBeenCalledWith(row.key);
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("provides an explicit empty state", async () => {
  view = await mountForm(
    <FinancialAttentionTable
      rows={[]}
      today="2026-09-22"
      horizon={90}
      snoozed={false}
    />,
  );
  expect(document.body.textContent).toContain(
    "No financial issues need attention",
  );
});
