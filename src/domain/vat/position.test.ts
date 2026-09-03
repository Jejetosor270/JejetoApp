import { describe, expect, it } from "vitest";

import { calculateProjectVatPosition } from "./position";

describe("Project VAT position", () => {
  it.each([
    ["20000", "12000", "PAYABLE", "8000.0000"],
    ["10000", "15000", "CREDIT", "5000.0000"],
    ["10000", "10000", "NEUTRAL", "0.0000"],
  ] as const)(
    "classifies output %s and deductible input %s as %s",
    (outputVat, deductibleInputVat, status, positionAmount) => {
      expect(
        calculateProjectVatPosition({ deductibleInputVat, outputVat }),
      ).toMatchObject({
        complete: true,
        positionAmount,
        status,
      });
    },
  );

  it("uses only the already-calculated deductible share", () => {
    expect(
      calculateProjectVatPosition({
        deductibleInputVat: "6000",
        outputVat: "8000",
      }),
    ).toMatchObject({
      netVat: "2000.0000",
      positionAmount: "2000.0000",
      status: "PAYABLE",
    });
  });

  it("does not change after a Client Receipt", () => {
    const documentAmounts = {
      deductibleInputVat: "12000",
      outputVat: "20000",
    };
    const beforeReceipt = calculateProjectVatPosition(documentAmounts);
    const afterReceipt = calculateProjectVatPosition(documentAmounts);
    expect(afterReceipt).toEqual(beforeReceipt);
  });

  it("does not change after a Supplier Payment", () => {
    const documentAmounts = {
      deductibleInputVat: "12000",
      outputVat: "20000",
    };
    const beforePayment = calculateProjectVatPosition(documentAmounts);
    const afterPayment = calculateProjectVatPosition(documentAmounts);
    expect(afterPayment).toEqual(beforePayment);
  });

  it("marks missing FX-derived monetary input as incomplete", () => {
    expect(
      calculateProjectVatPosition({
        deductibleInputVat: null,
        outputVat: "8000",
      }),
    ).toEqual({
      complete: false,
      deductibleInputVat: null,
      netVat: null,
      outputVat: "8000",
      positionAmount: null,
      status: null,
    });
  });
});
