// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { mountForm, enter, clickText, control } from "@/test/dom-form";
const actions = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(app)/billing/status-actions", () => ({
  changeBillingStatusAction: actions.save,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: actions.refresh }),
}));
import { BillingCreationStatus, BillingStatusControl } from "./billing-status";
let view: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => {
  await view?.unmount();
  vi.clearAllMocks();
});

it("requires an explicit creation status and exposes payment confirmation only for Paid", async () => {
  view = await mountForm(<BillingCreationStatus documentType="INVOICE" />);
  expect(control("workflowStatus").value).toBe("");
  expect(
    [...control("workflowStatus").querySelectorAll("option")].map(
      (o) => o.value,
    ),
  ).toEqual(["", "DRAFT", "TO_BE_INVOICED", "INVOICED", "PAID", "CANCELLED"]);
  expect(document.querySelector('[name="paymentDate"]')).toBeNull();
  await enter("workflowStatus", "PAID");
  expect(document.querySelector('[name="paymentDate"]')).not.toBeNull();
  expect(document.body.textContent).not.toContain("(manual)");
});

it("confirms the remaining amount and keeps payment details when saving fails", async () => {
  actions.save.mockResolvedValue({
    status: "error",
    message: "Check the payment FX.",
  });
  view = await mountForm(
    <BillingStatusControl
      id="billing"
      status="INVOICED"
      documentType="INVOICE"
      remaining="80.0000"
      currency="USD"
      canEdit
    />,
  );
  await clickText("Invoiced");
  await enter("billingStatus", "PAID");
  await enter("paymentDate", "2026-09-11");
  await enter("paymentFx", "0.9");
  expect(actions.save).toHaveBeenCalledTimes(1);
  const form = document.querySelector("form");
  if (!form) throw new Error("Missing confirmation form");
  await act(async () =>
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
  expect(actions.save).toHaveBeenCalledWith({
    id: "billing",
    value: "PAID",
    confirmedAmount: "80.0000",
    amount: "",
    paymentDate: "2026-09-11",
    paymentFx: "0.9",
  });
  expect(control("paymentFx").value).toBe("0.9");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Check the payment FX",
  );
  expect(actions.refresh).not.toHaveBeenCalled();
});

it.each(["DRAFT", "TO_BE_INVOICED", "CANCELLED"])(
  "requires a saved issued state before offering cash actions on %s",
  async (status) => {
    view = await mountForm(
      <BillingStatusControl
        id="billing"
        status={status}
        documentType="INVOICE"
        remaining="80.0000"
        currency="EUR"
        canEdit
      />,
    );
    expect(document.body.textContent).not.toContain("Mark as paid");
    const statusButton = document.querySelector<HTMLButtonElement>(
      '[aria-label="Change Billing status"]',
    );
    if (!statusButton) throw new Error("Missing status button");
    await act(async () => statusButton.click());
    const options = [
      ...control("billingStatus").querySelectorAll("option"),
    ].map((option) => option.value);
    expect(options).not.toContain("PAID");
    expect(options).not.toContain("PARTIALLY_PAID");
    expect(document.body.textContent).toContain(
      "Changing to Invoiced does not record a payment",
    );
    await enter("billingStatus", "INVOICED");
    expect(actions.save).not.toHaveBeenCalled();
    expect(document.querySelector('[name="paymentDate"]')).toBeNull();
    actions.save.mockResolvedValue({ status: "success", message: "Saved" });
    const form = document.querySelector("form");
    if (!form) throw new Error("Missing status form");
    await act(async () =>
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    expect(actions.save).toHaveBeenCalledExactlyOnceWith({
      id: "billing",
      value: "INVOICED",
      confirmedAmount: "80.0000",
      amount: "",
      paymentDate: "",
      paymentFx: "",
    });
  },
);

it("retains the one-click full receipt action for an issued, partially paid Invoice", async () => {
  actions.save.mockResolvedValue({ status: "success", message: "Saved" });
  view = await mountForm(
    <BillingStatusControl
      id="billing"
      status="PARTIALLY_PAID"
      documentType="INVOICE"
      remaining="80.0000"
      currency="EUR"
      canEdit
    />,
  );
  await clickText("Mark as paid");
  expect(actions.save).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      id: "billing",
      value: "PAID",
      confirmedAmount: "80.0000",
    }),
  );
});

it("shows only the status badge to read-only employees", async () => {
  view = await mountForm(
    <BillingStatusControl
      id="billing"
      status="INVOICED"
      documentType="INVOICE"
      remaining="80.0000"
      currency="EUR"
      canEdit={false}
    />,
  );
  expect(document.body.textContent).toContain("Invoiced");
  expect(document.querySelector("button")).toBeNull();
  expect(actions.save).not.toHaveBeenCalled();
});
