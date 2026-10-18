// @vitest-environment happy-dom
import { act, useState, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountForm, enter, control, clickText } from "@/test/dom-form";
import type { ClientBillingView } from "@/lib/billing/billing";
import { ReceiptTermAssignment } from "./receipt-term-assignment";

const actions = vi.hoisted(() => ({ update: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(app)/billing/actions", () => ({
  updateClientReceiptAction: actions.update,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: actions.refresh }),
}));
vi.mock("@/components/forms/editor-drawer", () => ({
  EditorDrawer: ({
    children,
    onOpenChange,
  }: {
    children: ReactNode;
    onOpenChange: (open: boolean) => void;
  }) => (
    <section role="dialog">
      <button onClick={() => onOpenChange(false)}>Close</button>
      {children}
    </section>
  ),
}));

const receipt = {
  id: "receipt",
  billingDocumentId: "invoice",
  installmentId: null,
  amount: "120.0000",
  fxRate: "1.1234567890",
  receivedAt: "2026-10-01",
  notes: "Keep notes",
  reference: "Bank reference",
  editVersion: "a".repeat(64),
} satisfies ClientBillingView["receipts"][number];
const term = {
  id: "term",
  basis: "FIXED_AMOUNT",
  billingDocumentId: "invoice",
  billingReference: "INV-1",
  billingTotalTtc: "240",
  currencyCode: "USD",
  dueDate: "2026-10-02",
  isCancelled: false,
  label: "Balance",
  notes: null,
  percentageRate: null,
  receipts: [],
  scheduledAmount: "120",
  sequence: 1,
  creditOutstandingAmount: "120",
  editVersion: "c".repeat(64),
  balanceReviewRequired: false,
} satisfies ClientBillingView["paymentInstallments"][number];
let view: Awaited<ReturnType<typeof mountForm>>;
beforeEach(() => {
  vi.clearAllMocks();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(async () => {
  await view?.unmount();
});

it("assigns the existing receipt without changing any cash or FX fields", async () => {
  actions.update.mockResolvedValue({ status: "success", message: "Saved" });
  view = await mountForm(
    <ReceiptTermAssignment
      receipt={receipt}
      terms={[term]}
      currencyCode="USD"
    />,
  );
  await clickText("Assign to term");
  await enter("installmentId", "term");
  await clickText("Assign receipt");
  const submitted = actions.update.mock.calls[0]?.[1] as FormData;
  expect(Object.fromEntries(submitted)).toEqual({
    id: receipt.id,
    billingDocumentId: receipt.billingDocumentId,
    expectedVersion: receipt.editVersion,
    amount: receipt.amount,
    fxRate: receipt.fxRate,
    receivedAt: receipt.receivedAt,
    notes: receipt.notes,
    reference: receipt.reference,
    installmentId: "term",
  });
  expect(actions.refresh).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("preserves selected term and the opening snapshot after conflict and server refresh", async () => {
  actions.update.mockResolvedValue({
    status: "error",
    message: "The receipt changed. Reopen it to review.",
  });
  let refreshRecord: (value: typeof receipt) => void = () => {};
  function Wrapper() {
    const [value, setValue] = useState(receipt);
    refreshRecord = setValue;
    return (
      <ReceiptTermAssignment
        receipt={value}
        terms={[term]}
        currencyCode="USD"
      />
    );
  }
  view = await mountForm(<Wrapper />);
  await clickText("Assign to term");
  await enter("installmentId", "term");
  await act(async () =>
    refreshRecord({ ...receipt, editVersion: "b".repeat(64), amount: "121" }),
  );
  await clickText("Assign receipt");
  expect(control("installmentId").value).toBe("term");
  expect(control("expectedVersion").value).toBe(receipt.editVersion);
  expect(control("amount").value).toBe("120.0000");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "receipt changed",
  );
  expect(actions.refresh).not.toHaveBeenCalled();
  await clickText("Close");
  await clickText("Assign to term");
  expect(control("expectedVersion").value).toBe("b".repeat(64));
});

it("excludes cancelled and unlike-currency terms and disables terms too small for the receipt", async () => {
  view = await mountForm(
    <ReceiptTermAssignment
      receipt={receipt}
      terms={[
        { ...term, id: "cancelled", isCancelled: true },
        { ...term, id: "foreign", currencyCode: "EUR" },
        { ...term, id: "small", scheduledAmount: "100" },
      ]}
      currencyCode="USD"
    />,
  );
  await clickText("Assign to term");
  expect(document.querySelector('option[value="cancelled"]')).toBeNull();
  expect(document.querySelector('option[value="foreign"]')).toBeNull();
  expect(
    document.querySelector<HTMLOptionElement>('option[value="small"]')
      ?.disabled,
  ).toBe(true);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "No term can hold this receipt",
  );
  expect(actions.update).not.toHaveBeenCalled();
});
