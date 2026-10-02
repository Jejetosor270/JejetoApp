// @vitest-environment happy-dom
import { act, useState } from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mountForm, enter, control } from "@/test/dom-form";
import type { CreditWorkspace } from "@/lib/credits/service";
const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/app/(app)/credit-actions", () => ({ saveCreditAction: mocks.save }));
import { CreditForm, CreditPanel } from "./credit-panel";
const workspace: CreditWorkspace = {
  side: "CLIENT",
  sourceId: "invoice",
  reference: "INV-1",
  currencyCode: "EUR",
  reportingCurrencyCode: "EUR",
  expectedVersion: "original-version",
  blockedReason: null,
  original: {
    totalHt: "100",
    vatAmount: "20",
    totalTtc: "120",
    freightCoverageHt: "10",
    otherCoverageHt: "0",
  },
  remaining: {
    totalHt: "100",
    vatAmount: "20",
    totalTtc: "120",
    freightCoverageHt: "10",
    otherCoverageHt: "0",
    merchandiseHt: "90",
    creditedTtc: "0",
  },
  cash: {
    paidTtc: "120",
    refundedTtc: "0",
    netDue: "120",
    netPaid: "120",
    outstanding: "0",
    refundDue: "0",
  },
  supplierVatEntry: null,
  orderAllocations: [
    {
      orderId: "order",
      reference: "ORDER-1",
      amountHt: "100",
      freightCoverageHt: "10",
      otherCoverageHt: "0",
    },
  ],
  credits: [],
};
let view: Awaited<ReturnType<typeof mountForm>>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({
    ok: false,
    message: "Record changed. Draft retained.",
  });
});
afterEach(async () => {
  await view?.unmount();
});
async function submit() {
  const form = document.querySelector("form");
  if (!form) throw Error("Missing form");
  await act(async () =>
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
}
it("shows balances but no creation controls to read-only employees", async () => {
  view = await mountForm(<CreditPanel workspace={workspace} canEdit={false} />);
  expect(view.container.textContent).toContain("Net due TTC");
  expect(view.container.textContent).not.toContain("Record credit");
});
it("keeps the opening version and complete draft across refresh and failed save", async () => {
  let refresh: () => void = () => undefined;
  function Wrapper() {
    const [value, setValue] = useState(workspace);
    refresh = () => setValue({ ...workspace, expectedVersion: "new-version" });
    return <CreditForm workspace={value} kind="credit" />;
  }
  view = await mountForm(<Wrapper />);
  await enter("reference", "CN-1");
  await enter("totalHt", "25");
  await enter("reason", "Returned item");
  await act(async () => refresh());
  await submit();
  expect(mocks.save).toHaveBeenCalledWith(
    "credit",
    expect.objectContaining({
      expectedVersion: "original-version",
      reference: "CN-1",
      totalHt: "25",
      allocations: [],
    }),
  );
  expect(control("reason").value).toBe("Returned item");
  expect(view.container.textContent).toContain("Draft retained");
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("sends only explicitly selected Order reductions and creates no receipt", async () => {
  view = await mountForm(<CreditForm workspace={workspace} kind="credit" />);
  const checkbox = document.querySelector<HTMLInputElement>(
    'input[name="allocate-order"]',
  );
  if (!checkbox) throw Error("Missing selection");
  await act(async () => checkbox.click());
  await enter("amount-order", "20");
  await enter("freight-order", "5");
  await submit();
  expect(mocks.save).toHaveBeenCalledWith(
    "credit",
    expect.objectContaining({
      allocations: [
        {
          orderId: "order",
          amountHt: "20",
          freightCoverageHt: "5",
          otherCoverageHt: "0",
        },
      ],
    }),
  );
  expect(mocks.save).toHaveBeenCalledTimes(1);
});
it("records a separate actual refund with its entered date and FX", async () => {
  view = await mountForm(
    <CreditForm
      workspace={{ ...workspace, currencyCode: "USD" }}
      kind="refund"
      creditId="credit"
    />,
  );
  await enter("amount", "25");
  await enter("fxRate", "0.92");
  await submit();
  expect(mocks.save).toHaveBeenCalledWith(
    "refund",
    expect.objectContaining({
      creditId: "credit",
      amount: "25",
      fxRate: "0.92",
      expectedVersion: "original-version",
    }),
  );
});
it("preserves historical credit and refund currencies after correcting the original", async () => {
  view = await mountForm(
    <CreditPanel
      canEdit={false}
      workspace={{
        ...workspace,
        credits: [
          {
            id: "old-credit",
            reference: "CN-USD",
            creditDate: "2026-10-01",
            reason: "Correction",
            currencyCode: "USD",
            reportingCurrencyCode: "EUR",
            totalHt: "20",
            vatAmount: "0",
            totalTtc: "20",
            freightCoverageHt: "0",
            otherCoverageHt: "0",
            merchandiseHt: "20",
            isCancelled: true,
            allocations: [],
            refunds: [
              {
                id: "old-refund",
                amount: "10",
                refundDate: "2026-10-01",
                fxRateToReporting: "0.92",
                reference: null,
                notes: null,
                isCancelled: true,
              },
            ],
          },
        ],
      }}
    />,
  );
  const history = view.container.querySelector("tbody");
  expect(history?.textContent).toContain("20.00 USD");
  expect(history?.textContent).toContain("10.00 USD");
  expect(history?.textContent).not.toContain("EUR");
});
