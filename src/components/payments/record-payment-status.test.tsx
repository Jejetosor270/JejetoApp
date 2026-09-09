// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { mountForm, enter, clickText } from "@/test/dom-form";
import { RecordPaymentStatus } from "./record-payment-status";
const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(app)/payments/record-status-actions", () => ({
  saveRecordStatusAction: mocks.save,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
let view: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => {
  await view?.unmount();
  vi.clearAllMocks();
});
it("retains a rejected override and allows returning to Automatic without recording cash", async () => {
  mocks.save
    .mockResolvedValueOnce({ status: "error", message: "Retry status" })
    .mockResolvedValue({ status: "success", message: "Saved" });
  view = await mountForm(
    <RecordPaymentStatus
      kind="billing"
      id="record"
      automatic="OVERDUE"
      cancelled={false}
      canEdit
    />,
  );
  const select = document.querySelector("select");
  select?.setAttribute("name", "paymentStatus");
  await enter("paymentStatus", "PAID");
  await clickText("Save status");
  expect(select?.value).toBe("PAID");
  expect(document.body.textContent).toContain("Retry status");
  await clickText("Save status");
  expect(mocks.save).toHaveBeenLastCalledWith({
    kind: "billing",
    id: "record",
    value: "PAID",
  });
  expect(document.body.textContent).toContain(
    "Manual status does not change cash or balances",
  );
  await enter("paymentStatus", "AUTO");
  await clickText("Save status");
  expect(mocks.save).toHaveBeenLastCalledWith({
    kind: "billing",
    id: "record",
    value: "AUTO",
  });
});
it("shows read-only users the manual label without mutation controls", async () => {
  view = await mountForm(
    <RecordPaymentStatus
      kind="order"
      id="record"
      automatic="OVERDUE"
      override="PAID"
      cancelled={false}
      canEdit={false}
      showCancel
    />,
  );
  expect(document.body.textContent).toContain("Paid (manual)");
  expect(document.querySelector("button,select")).toBeNull();
});
