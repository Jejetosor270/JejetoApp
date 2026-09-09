// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { mountForm, clickText, enter, control } from "@/test/dom-form";
const mocks = vi.hoisted(() => ({
  trash: vi.fn(),
  update: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/(app)/settings/trash/actions", () => ({
  trashSelectedAction: mocks.trash,
}));
vi.mock("@/app/(app)/payments/actions", () => ({
  updateSettlementAction: mocks.update,
}));
import { CashListTable } from "./cash-list-table";
import { SupplierRecordEditor } from "./supplier-record-editor";
import type { PaymentInstallmentView } from "@/lib/payments/payments";
let mounted: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => {
  await mounted?.unmount();
  vi.clearAllMocks();
});
it("selects only the checked payment and requires confirmation before moving it to Trash", async () => {
  const row = {
    id: "one",
    href: "/payments/one",
    reference: "PAY1",
    project: "Project",
    counterparty: "Supplier",
    document: "ORD1",
    date: "2026-09-01",
    amount: "100",
    currency: "EUR",
    status: "RECORDED",
  };
  mocks.trash.mockResolvedValue({
    status: "success",
    message: "Moved to Trash",
  });
  mounted = await mountForm(
    <CashListTable
      items={[row, { ...row, id: "two", reference: "PAY2" }]}
      title="Payments"
      kind="payment"
      canEdit
    />,
  );
  await act(async () =>
    document
      .querySelector<HTMLInputElement>('input[aria-label="Select PAY1"]')
      ?.click(),
  );
  expect(mocks.push).not.toHaveBeenCalled();
  await clickText("Delete selected");
  expect(mocks.trash).not.toHaveBeenCalled();
  await clickText("Cancel");
  expect(mocks.trash).not.toHaveBeenCalled();
  await clickText("Delete selected");
  await clickText("Move to Trash");
  const [kind, data] = mocks.trash.mock.calls[0] as [string, FormData];
  expect(kind).toBe("payment");
  expect(data.getAll("selectedIds")).toEqual(["one"]);
});
it("edits a payment in its own drawer, preserving a rejected draft and closing after success", async () => {
  const settlement = {
    id: "payment",
    amount: "30",
    fxRate: null,
    notes: null,
    reference: "PAY1",
    settledAt: "2026-09-01",
  };
  const installment: PaymentInstallmentView = {
    id: "installment",
    actualDate: null,
    basis: "FIXED_AMOUNT",
    clientName: "Client",
    currencyCode: "EUR",
    direction: "SUPPLIER_PAYMENT",
    dueDate: "2026-10-01",
    expectedFxRate: null,
    impliedPercentageRate: null,
    isCancelled: false,
    label: "Deposit",
    notes: null,
    orderId: "order",
    orderNumber: "ORD1",
    outstandingAmount: "70",
    paidAmount: "30",
    packageName: "Package",
    percentageRate: null,
    projectId: "project",
    projectName: "Project",
    reportingCurrencyCode: "EUR",
    scheduledAmount: "100",
    sequence: 1,
    settlements: [settlement],
    status: "PARTIALLY_PAID",
    supplierName: "Supplier",
  };
  mocks.update
    .mockResolvedValueOnce({
      status: "error",
      message: "Amount exceeds the installment.",
    })
    .mockResolvedValueOnce({ status: "success", message: "Saved" });
  mounted = await mountForm(
    <SupplierRecordEditor
      installment={installment}
      settlement={settlement}
      baseAmount="100"
      currencies={[{ code: "EUR" }]}
    />,
  );
  await clickText("Edit");
  await enter("amount", "90");
  await enter("reference", "Corrected payment");
  const submit = async () => {
    await act(async () => {
      document
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
  };
  await submit();
  expect(control("reference").value).toBe("Corrected payment");
  expect(document.body.textContent).toContain(
    "Amount exceeds the installment.",
  );
  await submit();
  expect(document.querySelector("form")).toBeNull();
  expect(mocks.refresh).toHaveBeenCalled();
});

vi.mock("@/app/(app)/related-records/inline-actions", () => ({
  editRelatedFinancialRowAction: vi.fn(),
}));

vi.mock("@/app/(app)/related-records/actions", () => ({
  editRelatedNameAction: vi.fn(),
  removeOptionalLinksAction: vi.fn(),
}));
vi.mock("@/app/(app)/unassigned-cash/actions", () => ({
  unassignCashAction: vi.fn(),
}));
