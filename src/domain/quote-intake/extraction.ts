import Decimal from "decimal.js";
import { z } from "zod";

import { vatAmount as calculateVatAmount } from "@/domain/finance/calculations";
import { isDateOnly } from "@/domain/payments/dates";
import { formatPercentage } from "@/domain/procurement/presentation";

export const extractionStatuses = [
  "EXTRACTED",
  "MISSING",
  "AMBIGUOUS",
] as const;

const diagnostic = z.string().trim().max(500).nullable();

function observedValue<T extends z.ZodType>(value: T) {
  return z
    .object({
      status: z.enum(extractionStatuses),
      value: value.nullable(),
      diagnostic,
    })
    .strict()
    .superRefine((observation, context) => {
      const observationValue =
        "value" in observation ? observation.value : null;
      if (observation.status === "EXTRACTED" && observationValue === null) {
        context.addIssue({
          code: "custom",
          message: "An extracted observation must include a value.",
          path: ["value"],
        });
      }
      if (observation.status === "MISSING" && observationValue !== null) {
        context.addIssue({
          code: "custom",
          message: "A missing observation cannot include a value.",
          path: ["value"],
        });
      }
      if (
        observation.status === "AMBIGUOUS" &&
        !observation.diagnostic?.trim()
      ) {
        context.addIssue({
          code: "custom",
          message: "An ambiguous observation requires a diagnostic.",
          path: ["diagnostic"],
        });
      }
    });
}

const normalizedMoney = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/)
  .max(40);
const normalizedRate = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/)
  .max(30);
const observedText = (maximum: number) =>
  observedValue(z.string().trim().min(1).max(maximum));
const observedMoney = observedValue(normalizedMoney);
const observedRate = observedValue(normalizedRate);
const observedDate = observedValue(
  z.string().refine(isDateOnly, "Expected YYYY-MM-DD."),
);
const observedInteger = observedValue(
  z
    .string()
    .regex(/^\d{1,3}$/)
    .max(3),
);

export const supplierQuoteExtractionSchema = z
  .object({
    supplier: z
      .object({
        legalName: observedText(200),
        displayName: observedText(160),
        vatNumber: observedText(64),
        address: observedText(500),
        email: observedText(320),
        phone: observedText(80),
      })
      .strict(),
    quote: z
      .object({
        reference: observedText(120),
        quoteDate: observedDate,
        validityDate: observedDate,
        currencyCode: observedValue(z.string().regex(/^[A-Z]{3}$/)),
      })
      .strict(),
    financials: z
      .object({
        goodsSubtotalHt: observedMoney,
        freightHt: observedMoney,
        freightRelationToTotal: observedValue(
          z.enum(["INCLUDED_IN_TOTAL", "ADDED_TO_TOTAL", "UNCLEAR"]),
        ),
        otherChargesHt: observedMoney,
        totalHt: observedMoney,
        vatLines: z
          .array(
            z
              .object({
                label: observedText(120),
                taxableBase: observedMoney,
                rate: observedRate,
                amount: observedMoney,
              })
              .strict(),
          )
          .max(8),
        totalVat: observedMoney,
        totalTtc: observedMoney,
      })
      .strict(),
    leadTime: z
      .object({
        raw: observedText(500),
        minimumWeeks: observedInteger,
        maximumWeeks: observedInteger,
        productionTimeRaw: observedText(500),
        expectedDeliveryRaw: observedText(500),
        expectedDeliveryDate: observedDate,
      })
      .strict(),
    paymentTerms: z
      .object({
        raw: observedText(2000),
        installments: z
          .array(
            z
              .object({
                label: observedText(200),
                basis: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "UNRESOLVED"]),
                percentageRate: observedRate,
                fixedAmount: observedMoney,
                timingDescription: observedText(500),
                objectiveDueDate: observedDate,
              })
              .strict(),
          )
          .max(12),
      })
      .strict(),
    warnings: z.array(z.string().trim().min(1).max(500)).max(30),
  })
  .strict();

export type SupplierQuoteExtraction = z.infer<
  typeof supplierQuoteExtractionSchema
>;
export type ExtractionStatus = (typeof extractionStatuses)[number];

function extracted<T>(field: {
  status: ExtractionStatus;
  value: T | null;
}): T | null {
  return field.status === "EXTRACTED" ? field.value : null;
}

function money(field: {
  status: ExtractionStatus;
  value: string | null;
}): string | null {
  const value = extracted(field);
  return value === null ? null : new Decimal(value).toFixed(4);
}

function rate(field: {
  status: ExtractionStatus;
  value: string | null;
}): string | null {
  const value = extracted(field);
  if (value === null) return null;
  const decimal = new Decimal(value);
  return decimal.lessThanOrEqualTo(1) ? decimal.toFixed(6) : null;
}

export interface QuotePaymentProposal {
  basis: "PERCENTAGE" | "FIXED_AMOUNT" | "UNRESOLVED";
  dueDate: string | null;
  fixedAmount: string | null;
  label: string;
  percentageRate: string | null;
  timingDescription: string | null;
}

export interface QuoteFinancialProposal {
  currencyCode: string | null;
  expectedDeliveryDate: string | null;
  freight: string | null;
  inputVatAmount: string | null;
  inputVatRate: string | null;
  inputVatTaxableBase: string | null;
  leadTimeWeeks: number | null;
  miscellaneous: string | null;
  purchaseCost: string | null;
  quoteDate: string | null;
  supplierQuoteReference: string | null;
}

export interface QuoteReviewProposal {
  financial: QuoteFinancialProposal;
  payments: QuotePaymentProposal[];
  warnings: string[];
}

function defaultPaymentProposal(
  extraction: SupplierQuoteExtraction,
  warnings: string[],
): QuotePaymentProposal[] {
  const extractedPayments = extraction.paymentTerms.installments.map(
    (installment) => ({
      basis: installment.basis,
      dueDate: extracted(installment.objectiveDueDate),
      fixedAmount: money(installment.fixedAmount),
      label: extracted(installment.label) ?? "Supplier installment",
      percentageRate: rate(installment.percentageRate),
      timingDescription: extracted(installment.timingDescription),
    }),
  );
  const hasUsablePayment = extractedPayments.some(
    (payment) =>
      (payment.basis === "PERCENTAGE" && payment.percentageRate !== null) ||
      (payment.basis === "FIXED_AMOUNT" && payment.fixedAmount !== null),
  );
  if (!hasUsablePayment) {
    warnings.push(
      "No complete payment schedule was extracted. A fully editable 100% full-payment installment was proposed.",
    );
    return [
      {
        basis: "PERCENTAGE",
        dueDate: null,
        fixedAmount: null,
        label: "Full payment",
        percentageRate: "1.000000",
        timingDescription: null,
      },
    ];
  }
  if (extractedPayments.length === 1) {
    const [payment] = extractedPayments;
    if (
      payment?.basis === "PERCENTAGE" &&
      payment.percentageRate !== null &&
      new Decimal(payment.percentageRate).greaterThan(0) &&
      new Decimal(payment.percentageRate).lessThan(1)
    ) {
      const balance = new Decimal(1).minus(payment.percentageRate);
      warnings.push(
        "A remaining-balance installment was added as an editable convenience default.",
      );
      return [
        payment,
        {
          basis: "PERCENTAGE",
          dueDate: null,
          fixedAmount: null,
          label: "Balance",
          percentageRate: balance.toFixed(6),
          timingDescription: null,
        },
      ];
    }
  }
  return extractedPayments;
}

function uniqueWarnings(values: string[]): string[] {
  return [...new Set(values)];
}

export function validateExtractionSemantics(
  extraction: SupplierQuoteExtraction,
): string[] {
  const warnings: string[] = [];
  const observations: Array<{
    label: string;
    status: ExtractionStatus;
    value: unknown;
  }> = [
    { label: "supplier legal name", ...extraction.supplier.legalName },
    { label: "supplier display name", ...extraction.supplier.displayName },
    { label: "currency", ...extraction.quote.currencyCode },
    { label: "HT total", ...extraction.financials.totalHt },
  ];
  for (const observation of observations) {
    if (observation.status === "EXTRACTED" && observation.value === null) {
      warnings.push(
        `The AI marked ${observation.label} as extracted without a value.`,
      );
    }
  }
  const rates = [
    ...extraction.financials.vatLines.map((line) => line.rate),
    ...extraction.paymentTerms.installments.map(
      (installment) => installment.percentageRate,
    ),
  ];
  if (
    rates.some(
      (item) =>
        item.status === "EXTRACTED" &&
        item.value !== null &&
        new Decimal(item.value).greaterThan(1),
    )
  ) {
    warnings.push("At least one extracted fractional rate exceeds 1.000000.");
  }
  return warnings;
}

export function buildQuoteReviewProposal(
  extraction: SupplierQuoteExtraction,
): QuoteReviewProposal {
  const warnings = [
    ...extraction.warnings,
    ...validateExtractionSemantics(extraction),
  ];
  const goods = money(extraction.financials.goodsSubtotalHt);
  const freight = money(extraction.financials.freightHt);
  const other = money(extraction.financials.otherChargesHt);
  const totalHt = money(extraction.financials.totalHt);
  const freightRelation = extracted(
    extraction.financials.freightRelationToTotal,
  );
  let purchaseCost = goods;

  if (freight && (freightRelation === null || freightRelation === "UNCLEAR")) {
    warnings.push(
      "Freight was extracted but its relationship to total HT is unclear; review the cost split before applying it.",
    );
  }

  if (!purchaseCost && totalHt) {
    if (freight && freightRelation === "UNCLEAR") {
      purchaseCost = null;
    } else if (freight && freightRelation === null) {
      purchaseCost = null;
    } else {
      const deductions =
        freightRelation === "INCLUDED_IN_TOTAL"
          ? new Decimal(freight ?? "0").plus(other ?? "0")
          : new Decimal(other ?? "0");
      const derived = new Decimal(totalHt).minus(deductions);
      if (derived.isNegative()) {
        warnings.push(
          "The extracted freight/other charges exceed the HT total; purchase cost was not derived.",
        );
      } else {
        purchaseCost = derived.toFixed(4);
      }
    }
  }
  if (!purchaseCost) {
    warnings.push("A reliable supplier purchase HT amount is still required.");
  }

  const vatLines = extraction.financials.vatLines.filter(
    (line) =>
      money(line.amount) !== null ||
      rate(line.rate) !== null ||
      money(line.taxableBase) !== null,
  );
  if (vatLines.length > 1) {
    warnings.push(
      "Multiple VAT rates or bases were extracted. The current Order model accepts one INPUT VAT entry, so VAT must be reviewed manually.",
    );
  }
  const singleVat = vatLines.length === 1 ? vatLines[0] : undefined;
  const inputVatAmount = singleVat ? money(singleVat.amount) : null;
  const inputVatRate = singleVat ? rate(singleVat.rate) : null;
  const observedVatTaxableBase = singleVat
    ? money(singleVat.taxableBase)
    : null;
  const inputVatTaxableBase = singleVat
    ? (totalHt ?? observedVatTaxableBase)
    : null;
  if (
    singleVat &&
    totalHt &&
    observedVatTaxableBase &&
    !new Decimal(totalHt).equals(observedVatTaxableBase)
  ) {
    warnings.push(
      "The single-rate VAT line base differs from Total HT. The reviewed taxable base uses Total HT; verify the observed VAT line before applying it.",
    );
  }
  if (inputVatTaxableBase && inputVatRate && inputVatAmount) {
    const expectedVat = calculateVatAmount(inputVatTaxableBase, inputVatRate);
    const variance = expectedVat.minus(inputVatAmount).abs();
    if (variance.greaterThan("0.02")) {
      warnings.push(
        `The observed VAT amount differs from taxable base × rate by ${variance.toFixed(2)}; keep the document amount as evidence and review it manually.`,
      );
    }
  }

  const totalVat = money(extraction.financials.totalVat);
  const totalTtc = money(extraction.financials.totalTtc);
  if (totalHt && totalVat && totalTtc) {
    const variance = new Decimal(totalHt).plus(totalVat).minus(totalTtc).abs();
    if (variance.greaterThan("0.02")) {
      warnings.push(
        `HT plus VAT differs from TTC by ${variance.toFixed(2)}; verify the quote totals.`,
      );
    }
  }

  const minimumWeeks = extracted(extraction.leadTime.minimumWeeks);
  const maximumWeeks = extracted(extraction.leadTime.maximumWeeks);
  const parsedMinimum = minimumWeeks === null ? null : Number(minimumWeeks);
  const parsedMaximum = maximumWeeks === null ? null : Number(maximumWeeks);
  const leadTimeWeeks = parsedMaximum ?? parsedMinimum;
  if (
    parsedMinimum !== null &&
    parsedMaximum !== null &&
    parsedMinimum !== parsedMaximum
  ) {
    warnings.push(
      `Lead time is a ${parsedMinimum}–${parsedMaximum} week range; the proposed Order value uses the conservative maximum.`,
    );
  }

  const payments = defaultPaymentProposal(extraction, warnings);
  const percentageTotal = payments.reduce(
    (total, installment) =>
      installment.basis === "PERCENTAGE" && installment.percentageRate
        ? total.plus(installment.percentageRate)
        : total,
    new Decimal(0),
  );
  if (
    payments.some((item) => item.basis === "PERCENTAGE") &&
    !percentageTotal.equals(1)
  ) {
    warnings.push(
      `Extracted percentage installments total ${formatPercentage(percentageTotal.toString())}, not 100%.`,
    );
  }
  if (payments.some((item) => item.dueDate === null)) {
    warnings.push(
      "One or more payment terms have no objective calendar date. Add due dates before approving a schedule.",
    );
  }

  return {
    financial: {
      currencyCode: extracted(extraction.quote.currencyCode),
      expectedDeliveryDate: extracted(extraction.leadTime.expectedDeliveryDate),
      freight,
      inputVatAmount,
      inputVatRate,
      inputVatTaxableBase,
      leadTimeWeeks,
      miscellaneous: other,
      purchaseCost,
      quoteDate: extracted(extraction.quote.quoteDate),
      supplierQuoteReference: extracted(extraction.quote.reference),
    },
    payments,
    warnings: uniqueWarnings([
      ...warnings,
      ...(extracted(extraction.quote.currencyCode) === null
        ? [
            "Quote currency is missing or ambiguous; employee confirmation is required.",
          ]
        : []),
    ]),
  };
}

export function extractedText(field: {
  status: ExtractionStatus;
  value: string | null;
}): string | null {
  return extracted(field);
}
