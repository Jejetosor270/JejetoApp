import { describe, expect, it } from "vitest";
import { assertCreditAllocations } from "./allocations";

const amount = (totalHt: string, freightCoverageHt = "0") => ({
  totalHt,
  vatAmount: "0",
  freightCoverageHt,
  otherCoverageHt: "0",
});
const allocation = (
  orderId: string,
  amountHt: string,
  freightCoverageHt = "0",
) => ({
  orderId,
  amountHt,
  freightCoverageHt,
  otherCoverageHt: "0",
});
const source = {
  original: amount("1000", "100"),
  originalAllocations: [
    allocation("A", "600", "60"),
    allocation("B", "300", "30"),
  ],
  previous: [],
};

describe("explicit credit attribution", () => {
  it("accepts a selected Order and a remaining Project share without proportional attribution", () => {
    expect(() =>
      assertCreditAllocations({
        ...source,
        credit: amount("200", "20"),
        allocations: [allocation("A", "150", "15")],
      }),
    ).not.toThrow();
  });
  it("requires explicit attribution when unallocated Project balance is insufficient", () => {
    expect(() =>
      assertCreditAllocations({
        ...source,
        credit: amount("200", "20"),
        allocations: [],
      }),
    ).toThrow(/original/);
  });
  it("rejects unknown Orders and over-crediting an individual Order or category", () => {
    expect(() =>
      assertCreditAllocations({
        ...source,
        credit: amount("10"),
        allocations: [allocation("C", "10")],
      }),
    ).toThrow(/already allocated/);
    expect(() =>
      assertCreditAllocations({
        ...source,
        credit: amount("400", "40"),
        allocations: [allocation("B", "400", "40")],
      }),
    ).toThrow(/original/);
    expect(() =>
      assertCreditAllocations({
        ...source,
        credit: amount("70", "70"),
        allocations: [allocation("A", "70", "70")],
      }),
    ).toThrow(/original/);
  });
  it("counts prior Order and Project reductions without moving them to another category", () => {
    const previous = [
      { ...amount("200", "20"), allocations: [allocation("A", "150", "15")] },
    ];
    expect(() =>
      assertCreditAllocations({
        ...source,
        previous,
        credit: amount("60", "6"),
        allocations: [],
      }),
    ).toThrow(/original/);
    expect(() =>
      assertCreditAllocations({
        ...source,
        previous,
        credit: amount("500", "50"),
        allocations: [allocation("A", "500", "50")],
      }),
    ).toThrow(/original/);
  });
  it("allows a VAT-only credit against a fully HT-allocated Invoice", () => {
    expect(() =>
      assertCreditAllocations({
        original: { ...amount("100"), vatAmount: "20" },
        originalAllocations: [allocation("A", "100")],
        previous: [],
        credit: { ...amount("0"), vatAmount: "10" },
        allocations: [],
      }),
    ).not.toThrow();
  });
  it("permits empty zero-valued remaining categories without inventing a credit", () => {
    expect(() =>
      assertCreditAllocations({
        original: amount("100"),
        originalAllocations: [allocation("A", "100")],
        previous: [],
        credit: amount("100"),
        allocations: [allocation("A", "100")],
      }),
    ).not.toThrow();
  });
});
