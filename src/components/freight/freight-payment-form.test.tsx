// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { mountForm, clickText, enter, control } from "@/test/dom-form";
import { FreightPaymentsTable } from "./freight-payment-form";
const mock = vi.hoisted(() => ({
  save: vi.fn(),
  refresh: vi.fn(),
  unassign: vi.fn(),
}));
vi.mock("@/app/(app)/projects/freight-payment-actions", () => ({
  saveFreightPaymentAction: mock.save,
  unassignFreightPaymentAction: mock.unassign,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mock.refresh }),
}));
let view: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => {
  await view?.unmount();
});
it("edits a payment inline, retains the rejected amount, and selects actual relationships", async () => {
  mock.save.mockResolvedValue({
    status: "error",
    message: "Payment exceeds outstanding.",
  });
  view = await mountForm(
    <FreightPaymentsTable
      expenseId="expense"
      currency="USD"
      reportingCurrency="EUR"
      canEdit
      payments={[
        {
          id: "payment",
          amount: "100",
          paidAt: "2026-09-01",
          fxRate: "0.9",
          reference: "Transfer",
          notes: "Original",
        },
      ]}
    />,
  );
  await clickText("Edit");
  await enter("amount", "150");
  await act(async () => {
    control("amount").form?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  const values = mock.save.mock.calls[0]?.[1] as FormData;
  expect(values.get("id")).toBe("payment");
  expect(values.get("fxRate")).toBe("0.9");
  expect(document.body.textContent).toContain("exceeds outstanding");
  expect(values.get("amount")).toBe("150");
  await clickText("Cancel");
  await act(async () => {
    document
      .querySelector<HTMLInputElement>(
        '[aria-label="Select all freight payments"]',
      )
      ?.click();
  });
  const checkbox =
    document.querySelector<HTMLInputElement>('input[name="ids"]');
  expect(checkbox?.checked).toBe(true);
  expect(checkbox?.form && new FormData(checkbox.form).getAll("ids")).toEqual([
    "payment",
  ]);
});
