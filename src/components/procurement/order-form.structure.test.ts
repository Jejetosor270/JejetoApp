import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "order-form.tsx"),
  "utf8",
);

describe("Order editor structure", () => {
  it("uses one controlled draft and has no legacy target-margin control", () => {
    expect(source).toContain("useState<OrderDraft>");
    expect(source).not.toContain("defaultValue=");
    expect(source).not.toContain('name="targetMarginPercent"');
    expect(source).not.toContain('name="outputVatAmount"');
  });

  it("presents automatic VAT base with one explicit override workflow", () => {
    expect(source).toContain('"outputVatBaseMode", "AUTO"');
    expect(source).toContain('"outputVatBaseMode", "MANUAL"');
    expect(source).toContain("Calculated automatically from Total Sell HT.");
    expect(source).toContain("Use calculated VAT base");
  });
});
