// @vitest-environment happy-dom
import { act, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountForm, clickText, enter, control } from "@/test/dom-form";
import type { BankImportView } from "@/lib/reconciliation/service";

const mocks = vi.hoisted(() => ({
  import: vi.fn(),
  match: vi.fn(),
  unmatch: vi.fn(),
  search: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/app/(app)/reports/reconciliation/actions", () => ({
  importBankAction: mocks.import,
  matchBankAction: mocks.match,
  unmatchBankAction: mocks.unmatch,
  searchBankAction: mocks.search,
}));
import { ImportBankForm } from "./import-bank";
import { MatchBankForm } from "./match-bank";

let view: Awaited<ReturnType<typeof mountForm>>;
const line: BankImportView["lines"][number] = {
  id: "line",
  version: "2026-10-01T00:00:00.000Z",
  rowNumber: 1,
  bookedAt: "2026-10-01",
  amount: "100",
  direction: "CLIENT_RECEIPT",
  reference: "BANK",
  description: "",
  status: "UNMATCHED",
  possibleDuplicate: false,
  matches: [],
};
const candidate = {
  id: "cash",
  kind: "CLIENT_RECEIPT",
  amount: "100",
  currencyCode: "EUR",
  direction: "CLIENT_RECEIPT",
  date: "2026-10-01",
  reference: "CASH",
  label: "Invoice INV-1",
  href: "/receipts/cash",
  fingerprint: "a".repeat(64),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.search.mockResolvedValue({
    ok: true,
    limited: false,
    candidates: [candidate],
  });
  mocks.match.mockResolvedValue({
    ok: false,
    error: "Cash changed. Review again.",
  });
  mocks.import.mockResolvedValue({
    ok: false,
    error: "Could not save. Try again.",
  });
});
afterEach(async () => {
  await view?.unmount();
});

async function checkbox(index: number) {
  const element = document.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  )[index];
  if (!element) throw new Error("Missing checkbox");
  await act(async () => element.click());
}
async function upload() {
  const element =
    document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!element) throw new Error("Missing upload");
  const file = new File(
    ["Date,Amount,Reference\n2026-10-01,100,INV-1"],
    "statement.csv",
    { type: "text/csv" },
  );
  Object.defineProperty(file, "text", {
    value: async () => "Date,Amount,Reference\n2026-10-01,100,INV-1",
  });
  Object.defineProperty(element, "files", {
    configurable: true,
    value: [file],
  });
  await act(async () =>
    element.dispatchEvent(new Event("change", { bubbles: true })),
  );
}

it("requires import review, preserves failed draft, and never submits source file contents", async () => {
  view = await mountForm(<ImportBankForm currencies={["EUR"]} />);
  await enter("accountLabel", "Operating");
  await enter("currencyCode", "EUR");
  await upload();
  await enter("mapping-date", "0");
  await enter("mapping-amount", "1");
  await enter("mapping-reference", "2");
  await clickText("Preview mapped rows");
  expect(mocks.import).not.toHaveBeenCalled();
  await checkbox(0);
  await clickText("Confirm import");
  expect(mocks.import).toHaveBeenCalledWith({
    accountLabel: "Operating",
    currencyCode: "EUR",
    confirmed: true,
    lines: [
      {
        rowNumber: 1,
        bookedAt: "2026-10-01",
        amount: "100",
        direction: "CLIENT_RECEIPT",
        reference: "INV-1",
        description: "",
        bankTransactionId: "",
      },
    ],
  });
  expect(view.container.textContent).toContain("Could not save");
  expect(view.container.textContent).toContain("INV-1");
  expect(control("accountLabel").value).toBe("Operating");
  expect(
    document.querySelector<HTMLInputElement>('input[type="file"]')?.value,
  ).toBe("");
  await enter("accountLabel", "Different account");
  expect(
    document.querySelector<HTMLInputElement>('input[name="confirmed"]')
      ?.checked,
  ).toBe(false);
});

it("preserves selection and original version through parent refresh and rejected save", async () => {
  function Harness() {
    const [current, setCurrent] = useState(line);
    return (
      <>
        <button
          onClick={() =>
            setCurrent({ ...line, version: "2026-10-02T00:00:00.000Z" })
          }
        >
          Refresh parent
        </button>
        <MatchBankForm line={current} currencyCode="EUR" />
      </>
    );
  }
  view = await mountForm(<Harness />);
  await clickText("Find existing cash");
  await checkbox(0);
  await enter("cashReference", "employee search");
  await clickText("Refresh parent");
  expect(view.container.textContent).toContain("Selected 1 cash record");
  expect(control("cashReference").value).toBe("employee search");
  await checkbox(1);
  await clickText("Confirm match");
  expect(mocks.match).toHaveBeenCalledWith({
    lineId: "line",
    version: line.version,
    confirmed: true,
    selections: [
      {
        id: "cash",
        kind: "CLIENT_RECEIPT",
        fingerprint: candidate.fingerprint,
      },
    ],
  });
  expect(view.container.textContent).toContain("Cash changed");
  expect(
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
  ).toBe(true);
});

it("guards duplicate confirmation submissions while pending", async () => {
  let finish: ((result: { ok: true }) => void) | undefined;
  mocks.match.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  view = await mountForm(<MatchBankForm line={line} currencyCode="EUR" />);
  await clickText("Find existing cash");
  await checkbox(0);
  await checkbox(1);
  const forms = view.container.querySelectorAll("form");
  await act(async () => {
    forms[1]?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    forms[1]?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  expect(mocks.match).toHaveBeenCalledTimes(1);
  await act(async () => finish?.({ ok: true }));
  expect(view.container.textContent).toContain("Cash records are unchanged");
});

it("shows invalidated matches as review-only until their links are explicitly removed", async () => {
  view = await mountForm(
    <MatchBankForm
      line={{
        ...line,
        status: "NEEDS_REVIEW",
        matches: [{ id: "cash", kind: "CLIENT_RECEIPT", cash: null }],
      }}
      currencyCode="EUR"
    />,
  );
  expect(view.container.textContent).toContain("not confirmed as reconciled");
  expect(view.container.textContent).toContain(
    "removed, unassigned or no longer eligible",
  );
  expect(view.container.textContent).not.toContain("Confirm match");
  expect(mocks.unmatch).not.toHaveBeenCalled();
});
