// @vitest-environment happy-dom
import { act, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { mountForm, enter, clickText } from "@/test/dom-form";
import { InstallmentForm } from "./payment-forms";
vi.mock("@/app/(app)/payments/actions", () => ({}));
vi.mock("@/app/(app)/payments/move-actions", () => ({}));
let view: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => view?.unmount());

it("preserves the edited draft and original snapshot across refresh and failed save", async () => {
  const save = vi.fn().mockResolvedValue({
    status: "error",
    message: "Changed since editing began. Your draft is retained.",
  });
  function Harness() {
    const [version, setVersion] = useState("a".repeat(64));
    return (
      <>
        <button onClick={() => setVersion("b".repeat(64))}>
          Refresh props
        </button>
        <InstallmentForm
          action={save}
          baseAmount="120"
          currencies={[{ code: "EUR" }]}
          defaultCurrencyCode="EUR"
          direction="SUPPLIER_PAYMENT"
          orderId="order"
          reportingCurrencyCode="EUR"
          installment={{
            id: "term",
            basis: "FIXED_AMOUNT",
            currencyCode: "EUR",
            label: "Deposit",
            percentageRate: null,
            scheduledAmount: "60",
            dueDate: "2026-10-20",
            notes: null,
            editVersion: version,
          }}
        />
      </>
    );
  }
  view = await mountForm(<Harness />);
  await enter("label", "My unsaved label");
  await clickText("Refresh props");
  await act(async () =>
    document
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(save).toHaveBeenCalledOnce();
  const submitted = save.mock.calls[0]?.[1] as FormData;
  expect(submitted.get("expectedVersion")).toBe("a".repeat(64));
  expect(submitted.get("label")).toBe("My unsaved label");
  expect(
    document.querySelector<HTMLInputElement>('[name="label"]')?.value,
  ).toBe("My unsaved label");
  expect(document.body.textContent).toContain("Your draft is retained");
});

it("suggests only the unscheduled amount for a new term", async () => {
  view = await mountForm(
    <InstallmentForm
      action={vi.fn()}
      baseAmount="120"
      suggestedAmount="20"
      currencies={[{ code: "EUR" }]}
      defaultCurrencyCode="EUR"
      direction="SUPPLIER_PAYMENT"
      orderId="order"
      reportingCurrencyCode="EUR"
    />,
  );
  const data = new FormData(document.querySelector("form") ?? undefined);
  expect(data.get("basis")).toBe("FIXED_AMOUNT");
  expect(data.get("fixedAmount")).toBe("20");
});
