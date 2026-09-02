import { describe, expect, it } from "vitest";

import { orderFieldErrors } from "@/domain/procurement/action-errors";

describe("Order action errors", () => {
  it("maps schema paths to visible form controls without exposing validators", () => {
    expect(
      orderFieldErrors([
        {
          message: "VAT rate must be a valid percentage.",
          path: ["outputVatRate"],
        },
        {
          message: "Markup must be a valid percentage.",
          path: ["productMarkupOverrideRate"],
        },
      ]),
    ).toEqual({
      outputVatRate: "VAT rate must be a valid percentage.",
      productMarkupOverridePercent: "Markup must be a valid percentage.",
    });
  });
});
