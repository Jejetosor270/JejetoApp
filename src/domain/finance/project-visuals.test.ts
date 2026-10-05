import { expect, it } from "vitest";
import {
  amountTone,
  billingProgress,
  comparisonWidths,
  hasDisplayRoundingDifference,
} from "./project-visuals";

it("scales comparable bars exactly without manufacturing missing values", () => {
  expect(comparisonWidths(["75", "100"])).toEqual(["75.0000", "100.0000"]);
  expect(comparisonWidths(["-25", "100"])).toEqual(["25.0000", "100.0000"]);
  expect(comparisonWidths([null, "100"])).toEqual([null, null]);
  expect(comparisonWidths(["0", "0"])).toEqual(["0", "0"]);
});
it("keeps progress bounded and zero plans distinct from complete ones", () => {
  expect(billingProgress("25", "100")).toBe("25.0000");
  expect(billingProgress("120", "100")).toBe("100.0000");
  expect(billingProgress("0", "0")).toBeNull();
  expect(billingProgress(null, "100")).toBeNull();
  expect(amountTone(null)).toBe("unknown");
  expect(amountTone("-0.1")).toBe("negative");
});
it("identifies cent-rounding reconciliation without rounding financial truth", () => {
  expect(
    hasDisplayRoundingDifference(["327093.7000", "-70793.5350"], "256300.1650"),
  ).toBe(true);
  expect(hasDisplayRoundingDifference(["100", "-25"], "75")).toBe(false);
  expect(hasDisplayRoundingDifference([null], null)).toBe(false);
});
