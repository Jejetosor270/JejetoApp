// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { mountForm } from "@/test/dom-form";
import { CreateBillingActions } from "./create-billing-actions";
const mocks = vi.hoisted(() => ({ review: vi.fn(), intake: vi.fn() }));
vi.mock("./client-document-intake", () => ({
  ClientDocumentReview: (props: unknown) => {
    mocks.review(props);
    return <p>Manual Billing fields</p>;
  },
  ClientDocumentIntake: () => {
    mocks.intake();
    return <p>Upload a Client document</p>;
  },
}));
let view: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => {
  await view?.unmount();
  vi.clearAllMocks();
});
it.each(["Enter manually", "Import Client document"])(
  "opens %s directly from New Billing",
  async (choice) => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    view = await mountForm(
      <CreateBillingActions
        options={{
          clients: [],
          projects: [],
          currencies: [],
          installments: [],
          orders: [],
        }}
      />,
    );
    const trigger = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("New Billing"),
    );
    await act(async () => {
      trigger?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });
    const item = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((node) => node.textContent === choice);
    expect(item).toBeDefined();
    await act(async () => {
      item?.click();
    });
    if (choice === "Enter manually") {
      expect(document.body.textContent).toContain("Manual Billing fields");
      expect(mocks.review).toHaveBeenCalledWith(
        expect.objectContaining({
          review: expect.objectContaining({
            provider: "manual",
            proposal: expect.objectContaining({ documentType: "INVOICE" }),
          }),
        }),
      );
      expect(mocks.intake).not.toHaveBeenCalled();
    } else {
      expect(document.body.textContent).toContain("Upload a Client document");
      expect(mocks.review).not.toHaveBeenCalled();
    }
  },
);
