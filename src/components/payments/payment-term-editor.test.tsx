// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clickText, mountForm } from "@/test/dom-form";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/app/(app)/payments/term-editor-actions", () => ({
  loadPaymentTermEditorAction: mocks.load,
}));
vi.mock("./supplier-term-actions", () => ({
  SupplierTermActions: ({
    onOpenChange,
  }: {
    onOpenChange: (open: boolean) => void;
  }) => (
    <div role="dialog">
      Full Supplier editor
      <button onClick={() => onOpenChange(false)}>Close editor</button>
    </div>
  ),
}));
vi.mock("@/components/billing/billing-term-actions", () => ({
  BillingTermActions: ({
    onOpenChange,
  }: {
    onOpenChange: (open: boolean) => void;
  }) => (
    <div role="dialog">
      Full Billing editor
      <button onClick={() => onOpenChange(false)}>Close editor</button>
    </div>
  ),
}));
import { PaymentTermEditor } from "./payment-term-editor";

let view: Awaited<ReturnType<typeof mountForm>>;
beforeEach(() => vi.resetAllMocks());
afterEach(async () => view?.unmount());

it.each(["supplier", "client"] as const)(
  "loads the shared %s editor fresh on every open",
  async (kind) => {
    mocks.load.mockResolvedValue({ data: { kind }, error: null });
    view = await mountForm(<PaymentTermEditor kind={kind} id="term" />);
    expect(mocks.load).not.toHaveBeenCalled();
    await clickText("Edit");
    expect(mocks.load).toHaveBeenCalledWith({ kind, id: "term" });
    expect(
      view.container.querySelector('[role="dialog"]')?.textContent,
    ).toContain(
      kind === "supplier" ? "Full Supplier editor" : "Full Billing editor",
    );
    await clickText("Close editor");
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    await clickText("Edit");
    expect(mocks.load).toHaveBeenCalledTimes(2);
  },
);

it("keeps a retry available after a failed read", async () => {
  mocks.load.mockResolvedValueOnce({ data: null, error: "Please retry" });
  view = await mountForm(<PaymentTermEditor kind="supplier" id="term" />);
  await clickText("Edit");
  expect(view.container.querySelector('[role="alert"]')?.textContent).toBe(
    "Please retry",
  );
  expect(view.container.querySelector('[role="dialog"]')).toBeNull();
  mocks.load.mockResolvedValueOnce({ data: { kind: "supplier" }, error: null });
  await clickText("Edit");
  expect(view.container.querySelector('[role="alert"]')).toBeNull();
  expect(view.container.querySelector('[role="dialog"]')).not.toBeNull();
});
