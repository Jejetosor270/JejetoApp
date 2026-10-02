// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { mountForm, enter, clickText, control } from "@/test/dom-form";
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  restore: vi.fn(),
  refresh: vi.fn(),
  followUp: vi.fn(),
}));
vi.mock("@/app/(app)/attention-actions", () => ({
  snoozeAttention: mocks.save,
  unsnoozeAttention: mocks.restore,
  updateAttentionFollowUp: mocks.followUp,
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

it("shows shared ownership to readers without edit controls", async () => {
  view = await mountForm(
    <FinancialAttentionTable
      rows={[
        {
          ...row,
          followUp: {
            version: 1,
            assigneeId: "employee",
            assigneeName: "Alex",
            nextFollowUpDate: "2026-09-20",
            note: "Awaiting confirmation",
          },
        },
      ]}
      today="2026-09-22"
      horizon={30}
      snoozed={false}
    />,
  );
  expect(document.body.textContent).toContain("Alex");
  expect(document.body.textContent).toContain("Follow-up overdue");
  expect(document.body.textContent).toContain("Awaiting confirmation");
  expect(
    [...document.querySelectorAll("button")].some(
      (button) => button.textContent === "Follow up",
    ),
  ).toBe(false);
});

it("preserves shared follow-up draft and its original version after a stale save", async () => {
  mocks.followUp.mockResolvedValue({
    ok: false,
    message: "This follow-up changed. Your draft is retained.",
  });
  const employee = "00000000-0000-4000-8000-000000000002";
  view = await mountForm(
    <FinancialAttentionTable
      rows={[
        {
          ...row,
          followUp: {
            version: 3,
            assigneeId: null,
            assigneeName: null,
            nextFollowUpDate: null,
            note: "Previous",
          },
        },
      ]}
      today="2026-09-22"
      horizon={30}
      snoozed={false}
      canEdit
      employees={[{ id: employee, name: "Alex" }]}
    />,
  );
  await clickText("Follow up");
  await enter("assigneeId", employee);
  await enter("followUpNote", "My unsaved note");
  await act(async () => {
    document
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(mocks.followUp).toHaveBeenCalledWith({
    key: row.key,
    horizon: 30,
    version: 3,
    assigneeId: employee,
    nextFollowUpDate: null,
    note: "My unsaved note",
  });
  expect(control("followUpNote").value).toBe("My unsaved note");
  expect(document.body.textContent).toContain("Your draft is retained");
  expect(mocks.refresh).not.toHaveBeenCalled();
  await clickText("Close");
  expect(document.body.textContent).toContain("Discard unsaved changes?");
  await clickText("Keep editing");
  expect(control("followUpNote").value).toBe("My unsaved note");
  expect(mocks.save).not.toHaveBeenCalled();
});

it("does not offer shared assignments for unstable duplicate groups", async () => {
  view = await mountForm(
    <FinancialAttentionTable
      rows={[{ ...row, key: "duplicate:00000000-0000-4000-8000-000000000001" }]}
      today="2026-09-22"
      horizon={30}
      snoozed={false}
      canEdit
    />,
  );
  expect(document.body.textContent).toContain(
    "changing duplicate groups cannot be assigned",
  );
  expect(
    [...document.querySelectorAll("button")].some(
      (button) => button.textContent === "Follow up",
    ),
  ).toBe(false);
});
