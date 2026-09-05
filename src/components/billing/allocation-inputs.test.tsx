// @vitest-environment happy-dom
import { act, useState } from "react";
import { describe, expect, it } from "vitest";
import { AllocationInputs } from "./allocation-inputs";
import { enter, mountForm } from "@/test/dom-form";

function Fixture() {
  const [amount, setAmount] = useState("");
  return (
    <form>
      <AllocationInputs
        amount={amount}
        onAmountChange={setAmount}
        billingTotalHt="100000"
        orderSellHt="40000"
        currencyCode="EUR"
      />
    </form>
  );
}
describe("allocation perspectives", () => {
  it("derives both percentages from one amount and updates that amount from either percentage", async () => {
    const view = await mountForm(<Fixture />);
    await enter("allocatedAmount", "20000");
    const percentages = document.querySelectorAll<HTMLInputElement>(
      'input:not([type="hidden"])',
    );
    expect(percentages[1]?.value).toBe("20");
    expect(percentages[2]?.value).toBe("50");
    const change = async (index: number, value: string) => {
      const input = percentages[index];
      if (!input) throw new Error("Missing percentage");
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await change(1, "10");
    expect(
      new FormData(document.querySelector("form")!).get("allocatedAmount"),
    ).toBe("10000.0000");
    await change(2, "100");
    expect(
      new FormData(document.querySelector("form")!).get("allocatedAmount"),
    ).toBe("40000.0000");
    await change(2, "101");
    expect(
      new FormData(document.querySelector("form")!).get("allocatedAmount"),
    ).toBe("");
    await view.unmount();
  });
});
