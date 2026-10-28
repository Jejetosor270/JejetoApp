// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { mountForm, clickText } from "@/test/dom-form";
import { RecordPaymentStatus } from "./record-payment-status";

const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(app)/payments/record-status-actions", () => ({
  saveRecordStatusAction: mocks.save,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("./order-term-payment-drawer", () => ({
  OrderTermPaymentDrawer: ({
    orderId,
    open,
    onOpenChange,
  }: {
    orderId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div role="dialog" data-order-id={orderId}>
        Choose a payment term
        <button onClick={() => onOpenChange(false)}>Close payments</button>
      </div>
    ) : null,
}));
let view: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => {
  await view?.unmount();
  vi.clearAllMocks();
});

it.each(["UNPAID", "PARTIALLY_PAID", "PAID", "OVERDUE"])(
  "%s opens term selection without recording all-Order cash",
  async (automatic) => {
    view = await mountForm(
      <RecordPaymentStatus
        kind="order"
        id="record"
        automatic={automatic}
        cancelled={false}
        canEdit
      />,
    );
    expect(document.querySelector("select")).toBeNull();
    expect(
      document.querySelector('[aria-label="Change payment status"]'),
    ).toBeNull();
    await clickText("Mark as paid");
    expect(
      document.querySelector('[role="dialog"]')?.getAttribute("data-order-id"),
    ).toBe("record");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    await clickText("Close payments");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  },
);

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

it("shows a cancelled Order without payment or cancellation controls", async () => {
  view = await mountForm(
    <RecordPaymentStatus
      kind="order"
      id="record"
      automatic="PAID"
      cancelled
      canEdit
      showCancel
    />,
  );
  expect(document.body.textContent).toContain("Cancelled");
  expect(document.querySelector("button,select")).toBeNull();
});

it.each(["order", "billing"] as const)(
  "keeps %s cancellation separate and confirmed",
  async (kind) => {
    const onCancelled = vi.fn();
    mocks.save
      .mockResolvedValueOnce({
        status: "error",
        message: "Review the record first.",
      })
      .mockResolvedValueOnce({ status: "success", message: "Cancelled" });
    view = await mountForm(
      <RecordPaymentStatus
        kind={kind}
        id="record"
        automatic="UNPAID"
        cancelled={false}
        canEdit
        showCancel
        onCancelled={onCancelled}
      />,
    );
    if (kind === "billing")
      expect(document.body.textContent).not.toContain("Mark as paid");
    await clickText(`Cancel ${kind === "order" ? "Order" : "Billing"}`);
    expect(mocks.save).not.toHaveBeenCalled();
    await clickText("Confirm cancellation");
    expect(mocks.save).toHaveBeenCalledWith({
      kind,
      id: "record",
      value: "CANCEL",
    });
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "Review the record first.",
    );
    expect(onCancelled).not.toHaveBeenCalled();
    await clickText("Confirm cancellation");
    expect(onCancelled).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  },
);
