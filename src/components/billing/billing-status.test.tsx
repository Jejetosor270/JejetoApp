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
  ).toEqual([
    "",
    "DRAFT",
    "TO_BE_INVOICED",
    "INVOICED",
    "PAID",
    "OVERDUE",
    "CANCELLED",
  ]);
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
  expect(actions.save).not.toHaveBeenCalled();
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
    paymentDate: "2026-09-11",
    paymentFx: "0.9",
  });
  expect(control("paymentFx").value).toBe("0.9");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Check the payment FX",
  );
  expect(actions.refresh).not.toHaveBeenCalled();
});
