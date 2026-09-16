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
it("Paid immediately records remaining cash and preserves a rejected FX completion", async () => {
  mocks.save
    .mockResolvedValueOnce({ status: "error", message: "Enter actual FX" })
    .mockResolvedValue({ status: "success", message: "Saved" });
  view = await mountForm(
    <RecordPaymentStatus
      kind="order"
      id="record"
      automatic="OVERDUE"
      cancelled={false}
      canEdit
    />,
  );
  await clickText("Mark as paid");
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "order", id: "record", value: "PAID" }),
  );
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Enter actual FX",
  );
  await clickText("Record payment");
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("Partially paid opens amount entry without creating cash until submitted", async () => {
  mocks.save.mockResolvedValue({ status: "success", message: "Saved" });
  view = await mountForm(
    <RecordPaymentStatus
      kind="order"
      id="record"
      automatic="UNPAID"
      cancelled={false}
      canEdit
    />,
  );
  document.querySelector("select")?.setAttribute("name", "status");
  await enter("status", "PARTIALLY_PAID");
  expect(mocks.save).not.toHaveBeenCalled();
  await enter("amount", "25");
  await clickText("Record payment");
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({ value: "PARTIALLY_PAID", amount: "25" }),
  );
});
it("shows read-only users the actual derived label without mutation controls", async () => {
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
  expect(document.body.textContent).toContain("Overdue");
  expect(document.querySelector("button,select")).toBeNull();
});
