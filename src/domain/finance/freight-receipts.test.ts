import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { summarizeFreightReceipts } from "./freight-receipts";

type Input = Parameters<typeof summarizeFreightReceipts>[0];
const receipt = (amount: string, id = "receipt-1") => ({
  id,
  amount,
  currencyCode: "EUR",
  fxRateToReporting: null,
});
const credit = (totalHt: string, vatAmount = "0", freightCoverageHt = "0") => ({
  totalHt,
  vatAmount,
  freightCoverageHt,
  currencyCode: "EUR",
  isCancelled: false,
});
const invoice: Input = {
  totalTtc: "120",
  freightCoverageHt: "20",
  currencyCode: "EUR",
  reportingCurrencyCode: "EUR",
  credits: [],
  receipts: [],
  refunds: [],
};

describe("net Invoice freight cash attribution", () => {
  it.each([
    ["0", "0.0000"],
    ["30", "5.0000"],
    ["120", "20.0000"],
  ])("attributes an ordinary receipt of %s TTC", (amount, expected) => {
    expect(
      summarizeFreightReceipts({ ...invoice, receipts: [receipt(amount)] }),
    ).toMatchObject({
      paidFreightHt: expected,
      reportingPaidFreightHt: expected,
    });
  });

  it("returns zero without creating cash rows for an unpaid credited Invoice", () => {
    expect(
      summarizeFreightReceipts({ ...invoice, credits: [credit("80", "16")] }),
    ).toEqual({
      paidFreightHt: "0.0000",
      reportingPaidFreightHt: "0.0000",
      contributions: [],
    });
  });

  it.each([
    ["12", "10.0000"],
    ["24", "20.0000"],
    ["120", "20.0000"],
  ])(
    "attributes %s TTC after merchandise credit against the remaining freight",
    (amount, expected) => {
      expect(
        summarizeFreightReceipts({
          ...invoice,
          credits: [credit("80", "16")],
          receipts: [receipt(amount)],
        }),
      ).toMatchObject({
        paidFreightHt: expected,
        reportingPaidFreightHt: expected,
      });
    },
  );

  it.each([
    ["0", "10.0000"],
    ["6", "10.0000"],
    ["12", "10.0000"],
  ])(
    "caps previously paid freight while %s TTC has actually been refunded",
    (refunded, expected) => {
      const result = summarizeFreightReceipts({
        ...invoice,
        credits: [credit("10", "2", "10")],
        receipts: [receipt("120")],
        refunds: new Decimal(refunded).isZero()
          ? []
          : [receipt(refunded, "refund-1")],
      });
      expect(result.paidFreightHt).toBe(expected);
      expect(result.reportingPaidFreightHt).toBe(expected);
      expect(result.contributions).toHaveLength(refunded === "0" ? 1 : 2);
    },
  );

  it("attributes a partial payment after a freight-only credit", () => {
    expect(
      summarizeFreightReceipts({
        ...invoice,
        credits: [credit("10", "2", "10")],
        receipts: [receipt("54")],
      }).reportingPaidFreightHt,
    ).toBe("5.0000");
  });

  it("reconciles partial receipts and an actual refund after category credits", () => {
    expect(
      summarizeFreightReceipts({
        ...invoice,
        credits: [credit("40", "8", "10")],
        receipts: [receipt("24"), receipt("24", "receipt-2")],
        refunds: [receipt("12", "refund-1")],
      }),
    ).toMatchObject({
      paidFreightHt: "5.0000",
      reportingPaidFreightHt: "4.9999",
      contributions: [
        { id: "receipt-1", isRefund: false, reportingAmountHt: "3.3333" },
        { id: "receipt-2", isRefund: false, reportingAmountHt: "3.3333" },
        { id: "refund-1", isRefund: true, reportingAmountHt: "-1.6667" },
      ],
    });
  });

  it.each(["0", "60", "120"])(
    "has no freight attribution on a full credit with %s TTC actual refunds",
    (refunded) => {
      const result = summarizeFreightReceipts({
        ...invoice,
        credits: [credit("100", "20", "20")],
        receipts: [receipt("120")],
        refunds: [receipt(refunded, "refund-1")],
      });
      expect(result.paidFreightHt).toBe("0.0000");
      expect(result.reportingPaidFreightHt).toBe("0.0000");
      expect(result.contributions.every((row) => row.amountHt === "0")).toBe(
        true,
      );
    },
  );

  it("ignores cancelled category credits", () => {
    expect(
      summarizeFreightReceipts({
        ...invoice,
        credits: [{ ...credit("80", "16"), isCancelled: true }],
        receipts: [receipt("24")],
      }).reportingPaidFreightHt,
    ).toBe("4.0000");
  });

  it("combines multiple active credits independently of their order", () => {
    const credits = [credit("40", "8"), credit("40", "8")];
    const input = { ...invoice, receipts: [receipt("24")], credits };
    const result = summarizeFreightReceipts(input);
    expect(result.reportingPaidFreightHt).toBe("20.0000");
    expect(
      summarizeFreightReceipts({ ...input, credits: [...credits].reverse() }),
    ).toEqual(result);
  });

  it("retains each receipt and refund's independent actual FX", () => {
    const result = summarizeFreightReceipts({
      ...invoice,
      currencyCode: "USD",
      credits: [{ ...credit("80", "16"), currencyCode: "USD" }],
      receipts: [
        { ...receipt("60"), currencyCode: "USD", fxRateToReporting: "0.8" },
        {
          ...receipt("60", "receipt-2"),
          currencyCode: "USD",
          fxRateToReporting: "0.9",
        },
      ],
      refunds: [
        {
          ...receipt("96", "refund-1"),
          currencyCode: "USD",
          fxRateToReporting: "0.95",
        },
      ],
    });
    expect(result).toMatchObject({
      paidFreightHt: "20.0000",
      reportingPaidFreightHt: "9.0000",
      contributions: [
        { reportingAmountHt: "40.0000" },
        { reportingAmountHt: "45.0000" },
        { reportingAmountHt: "-76.0000" },
      ],
    });
  });

  it.each(["receipt", "refund"])(
    "keeps a missing contributing %s FX incomplete",
    (missing) => {
      const result = summarizeFreightReceipts({
        ...invoice,
        currencyCode: "USD",
        credits: [{ ...credit("40", "8"), currencyCode: "USD" }],
        receipts: [
          {
            ...receipt("60"),
            currencyCode: "USD",
            fxRateToReporting: missing === "receipt" ? null : "0.8",
          },
        ],
        refunds: [
          {
            ...receipt("24", "refund-1"),
            currencyCode: "USD",
            fxRateToReporting: missing === "refund" ? null : "0.9",
          },
        ],
      });
      expect(result.paidFreightHt).toBe("10.0000");
      expect(result.reportingPaidFreightHt).toBeNull();
      expect(
        result.contributions.find(
          (row) => row.isRefund === (missing === "refund"),
        )?.reportingAmountHt,
      ).toBeNull();
    },
  );

  it("does not require FX for zero attributed freight", () => {
    expect(
      summarizeFreightReceipts({
        ...invoice,
        currencyCode: "USD",
        credits: [{ ...credit("100", "20", "20"), currencyCode: "USD" }],
        receipts: [{ ...receipt("120"), currencyCode: "USD" }],
      }).reportingPaidFreightHt,
    ).toBe("0.0000");
  });

  it("never treats an actual FX in another reporting currency as comparable", () => {
    expect(
      summarizeFreightReceipts({
        ...invoice,
        receipts: [
          {
            ...receipt("120"),
            reportingCurrencyCode: "GBP",
            fxRateToReporting: "1",
          },
        ],
      }).reportingPaidFreightHt,
    ).toBeNull();
  });

  it.each<Partial<Input>>([
    { receipts: [{ ...receipt("120"), currencyCode: "USD" }] },
    { credits: [{ ...credit("10"), currencyCode: "USD" }] },
    { credits: [credit("101", "20", "20")] },
    { credits: [credit("21", "0", "21")] },
    { credits: [credit("80", "21")] },
    { receipts: [receipt("12")], refunds: [receipt("13", "refund-1")] },
    { receipts: [receipt("-1")] },
    { freightCoverageHt: "121" },
  ])(
    "keeps inconsistent source amounts/currencies incomplete (%j)",
    (change) => {
      const result = summarizeFreightReceipts({ ...invoice, ...change });
      expect(result.paidFreightHt).toBeNull();
      expect(result.reportingPaidFreightHt).toBeNull();
    },
  );

  it("sums the four-decimal reporting rows without a hidden rounding remainder", () => {
    const result = summarizeFreightReceipts({
      ...invoice,
      totalTtc: "3",
      freightCoverageHt: "1",
      receipts: [
        receipt("1"),
        receipt("1", "receipt-2"),
        receipt("1", "receipt-3"),
      ],
    });
    const sum = result.contributions.reduce(
      (total, row) => total.plus(row.reportingAmountHt ?? "0"),
      new Decimal(0),
    );
    expect(result.paidFreightHt).toBe("1.0000");
    expect(result.reportingPaidFreightHt).toBe("0.9999");
    expect(sum.toFixed(4)).toBe(result.reportingPaidFreightHt);
  });
});
