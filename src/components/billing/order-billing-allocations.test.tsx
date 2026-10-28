// @vitest-environment happy-dom
import { act, useState } from "react";
import { afterEach, expect, it } from "vitest";
import { clickText, control, enter, mountForm } from "@/test/dom-form";
import {
  OrderBillingAllocations,
  type OrderBillingDocumentOption,
} from "./order-billing-allocations";

const documents: OrderBillingDocumentOption[] = [
  {
    id: "billing-a",
    reference: "INV-A",
    shortDescription: "Living room deposit",
    currencyCode: "EUR",
    totalHt: "1000",
    allocatedHt: "200",
    fxRateToReporting: null,
    isProjectRemainderApproved: false,
  },
  {
    id: "billing-b",
    reference: "INV-B",
    shortDescription: "Terrace balance",
    currencyCode: "USD",
    totalHt: "2000",
    allocatedHt: "0",
    fxRateToReporting: null,
    isProjectRemainderApproved: true,
  },
];
let view: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => view?.unmount());
function payload() {
  const form = document.querySelector("form");
  if (!form) throw new Error("Missing form");
  return JSON.parse(String(new FormData(form).get("billingAllocations")));
}

it("adds independent allocations with descriptions and excludes removed rows from submission", async () => {
  view = await mountForm(
    <form>
      <OrderBillingAllocations
        documents={documents}
        getOrderSellHt={() => "700"}
      />
    </form>,
  );
  expect(payload()).toEqual([]);
  await clickText("Add allocation");
  await enter("billingAllocations.0.billingDocumentId", "billing-a");
  expect(view.container.textContent).toContain("Living room deposit");
  expect(view.container.textContent).toContain("800.00 EUR");
  expect(payload()[0].allocatedAmount).toBe("");
  await enter("billingAllocations.0.allocatedAmount", "300");
  await enter("billingAllocations.0.allocatedAmount.freightCoverageHt", "20");
  await clickText("Add allocation");
  await enter("billingAllocations.1.billingDocumentId", "billing-b");
  await enter("billingAllocations.1.allocatedAmount", "400");
  expect(payload()).toEqual([
    {
      billingDocumentId: "billing-a",
      allocatedAmount: "300",
      freightCoverageHt: "20",
      otherCoverageHt: "0",
      isProjectRemainderApproved: false,
      basis: "FIXED_AMOUNT",
    },
    {
      billingDocumentId: "billing-b",
      allocatedAmount: "400",
      freightCoverageHt: "0",
      otherCoverageHt: "0",
      isProjectRemainderApproved: true,
      basis: "FIXED_AMOUNT",
    },
  ]);
  const secondSelect = control(
    "billingAllocations.1.billingDocumentId",
  ) as HTMLSelectElement;
  expect(
    secondSelect.querySelector<HTMLOptionElement>('option[value="billing-a"]')
      ?.disabled,
  ).toBe(true);
  const remove = view.container.querySelector<HTMLButtonElement>(
    '[aria-label="Remove allocation 1"]',
  );
  await act(async () => remove?.click());
  expect(payload()).toEqual([
    expect.objectContaining({
      billingDocumentId: "billing-b",
      allocatedAmount: "400",
    }),
  ]);
  expect(control("billingAllocations.0.allocatedAmount").value).toBe("400.00");
});

it("retains reviewed amounts after errors and pricing refreshes, and leaves missing FX incomplete", async () => {
  function Harness() {
    const [failed, setFailed] = useState(false);
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setFailed(true);
        }}
      >
        <OrderBillingAllocations
          documents={documents}
          getOrderSellHt={(document) =>
            document.currencyCode === "USD" ? null : failed ? "900" : "700"
          }
          fieldErrors={
            failed
              ? {
                  billingAllocations: "Review the allocations.",
                  "billingAllocations.0.allocatedAmount":
                    "Amount exceeds available Billing HT.",
                }
              : {}
          }
        />
        <button type="submit">Save</button>
      </form>
    );
  }
  view = await mountForm(<Harness />);
  await clickText("Add allocation");
  await enter("billingAllocations.0.billingDocumentId", "billing-a");
  await enter("billingAllocations.0.allocatedAmount", "850");
  await clickText("Save");
  expect(payload()[0].allocatedAmount).toBe("850");
  expect(view.container.textContent).toContain("900.00 EUR");
  expect(view.container.textContent).toContain("Review the allocations.");
  expect(view.container.textContent).toContain(
    "Amount exceeds available Billing HT.",
  );
  await clickText("Add allocation");
  await enter("billingAllocations.1.billingDocumentId", "billing-b");
  const second = view.container.querySelectorAll("fieldset")[1];
  if (!second) throw new Error("Missing second allocation");
  expect(second.textContent).toContain("complete manual FX");
  expect(
    second.querySelector<HTMLInputElement>("input:disabled"),
  ).not.toBeNull();
  expect(payload()[1].allocatedAmount).toBe("");
});

it("can skip allocations when this Project has no Billing", async () => {
  view = await mountForm(
    <form>
      <OrderBillingAllocations documents={[]} getOrderSellHt={() => null} />
    </form>,
  );
  expect(payload()).toEqual([]);
  expect(view.container.textContent).toContain(
    "No Billing available in this Project.",
  );
  expect(
    view.container.querySelector<HTMLButtonElement>("button")?.disabled,
  ).toBe(true);
});
