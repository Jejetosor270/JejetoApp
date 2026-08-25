import { describe, expect, it } from "vitest";

import { COMPANY_REPORTING_CURRENCY_CODE } from "@/config/reporting";

describe("company reporting configuration", () => {
  it("uses EUR for comparable company and portfolio totals", () => {
    expect(COMPANY_REPORTING_CURRENCY_CODE).toBe("EUR");
  });
});
