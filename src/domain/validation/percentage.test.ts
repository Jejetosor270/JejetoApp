import { describe, expect, it } from "vitest";

import { optionalPercentageFraction } from "@/domain/validation/percentage";

describe("human percentage validation", () => {
  const percentage = optionalPercentageFraction({
    label: "VAT rate",
    maximumPercent: "100",
  });

  it.each([
    ["0.0", "0.000000"],
    ["0,0", "0.000000"],
    ["0.0001", "0.000001"],
    ["20", "0.200000"],
    ["20.0", "0.200000"],
    ["20.0000", "0.200000"],
    ["15,5", "0.155000"],
    ["15%", "0.150000"],
    ["100", "1.000000"],
    ["100.0", "1.000000"],
    ["100,0", "1.000000"],
    ["100.0000", "1.000000"],
    ["0", "0.000000"],
    ["", undefined],
    ["   ", undefined],
  ])("normalizes %s to a stored fractional rate", (input, expected) => {
    expect(percentage.parse(input)).toBe(expected);
  });

  it("rounds accepted human precision to four percentage decimals", () => {
    expect(percentage.parse("15.55555")).toBe("0.155556");
  });

  it.each(["-0.0001", "100.0001", "101", "twenty", "15..5", "15,5.2", "15%%"])(
    "rejects invalid input %s with a human message",
    (input) => {
      const result = percentage.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).not.toContain("^(?:");
        expect(result.error.issues[0]?.message).toMatch(
          /valid percentage|between 0 and 100/,
        );
      }
    },
  );
});
