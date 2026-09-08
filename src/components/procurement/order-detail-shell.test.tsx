// @vitest-environment happy-dom
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { mountForm, clickText, enter, control } from "@/test/dom-form";
import { OrderDetailShell } from "./order-detail-shell";

vi.mock("./order-form", () => ({
  OrderForm: () => (
    <form>
      <input name="orderDraft" defaultValue="Original" />
    </form>
  ),
}));
const options = {} as ComponentProps<typeof OrderDetailShell>["options"];
const order = {} as ComponentProps<typeof OrderDetailShell>["order"];
let view: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => {
  await view?.unmount();
});

it("keeps detail drafts mounted while the Order editor uses the guarded side panel", async () => {
  view = await mountForm(
    <OrderDetailShell canEdit options={options} order={order}>
      <input name="scheduleDraft" defaultValue="Original schedule" />
    </OrderDetailShell>,
  );
  await enter("scheduleDraft", "Keep schedule");
  await clickText("Edit order");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Edit Order",
  );
  expect(control("scheduleDraft").value).toBe("Keep schedule");
  await enter("orderDraft", "Unsaved order");
  await clickText("Close");
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
    "Discard unsaved changes?",
  );
  await clickText("Keep editing");
  expect(control("orderDraft").value).toBe("Unsaved order");
  await clickText("Close");
  await clickText("Discard changes");
  expect(control("scheduleDraft").value).toBe("Keep schedule");
});

it("does not offer Order editing to read-only employees", async () => {
  view = await mountForm(
    <OrderDetailShell canEdit={false} options={options} order={order}>
      Summary
    </OrderDetailShell>,
  );
  expect(view.container.textContent).toBe("Summary");
  expect(view.container.querySelector("button")).toBeNull();
});
