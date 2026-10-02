import Decimal from "decimal.js";
import { z } from "zod";
import { isDateOnly } from "@/domain/payments/dates";

export const MAX_CSV_BYTES = 4 * 1024 * 1024;
export const MAX_BANK_ROWS = 1000;
export const cashKinds = [
  "SUPPLIER_PAYMENT",
  "CLIENT_RECEIPT",
  "FREIGHT_PAYMENT",
  "CREDIT_REFUND",
] as const;
export type CashKind = (typeof cashKinds)[number];
export const bankLineSchema = z
  .object({
    rowNumber: z.number().int().positive(),
    bookedAt: z.string().refine(isDateOnly, "Enter a valid booking date."),
    direction: z.enum(["SUPPLIER_PAYMENT", "CLIENT_RECEIPT"]),
    amount: z
      .string()
      .regex(/^\d{1,15}(?:\.\d{1,4})?$/)
      .refine(
        (value) => new Decimal(value).greaterThan(0),
        "Amount must be positive.",
      ),
    reference: z.string().trim().max(240).default(""),
    description: z.string().trim().max(500).default(""),
    bankTransactionId: z.string().trim().max(240).default(""),
  })
  .strict();
export type BankLine = z.infer<typeof bankLineSchema>;
export const bankImportSchema = z
  .object({
    accountLabel: z.string().trim().min(1).max(120),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    lines: z.array(bankLineSchema).min(1).max(MAX_BANK_ROWS),
    confirmed: z.literal(true),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.lines.map((line) => line.rowNumber)).size ===
      value.lines.length,
    "Bank row numbers must be unique.",
  );
export const selectionSchema = z
  .object({
    kind: z.enum(cashKinds),
    id: z.uuid(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const matchSchema = z
  .object({
    lineId: z.uuid(),
    version: z.string().datetime(),
    selections: z.array(selectionSchema).min(1).max(100),
    confirmed: z.literal(true),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.selections.map((row) => `${row.kind}:${row.id}`)).size ===
      value.selections.length,
    "Select each cash record once.",
  );
export const unmatchSchema = z
  .object({
    lineId: z.uuid(),
    version: z.string().datetime(),
    confirmed: z.literal(true),
  })
  .strict();
export class ReconciliationError extends Error {}

export interface CashCandidate {
  kind: CashKind;
  id: string;
  amount: string;
  currencyCode: string;
  direction: BankLine["direction"];
  date: string;
  reference: string;
  label: string;
  href: string;
  fingerprint: string;
}

export function validateMatch(
  line: Pick<BankLine, "amount" | "direction"> & { currencyCode: string },
  cash: readonly CashCandidate[],
): void {
  if (
    !cash.length ||
    new Set(cash.map((row) => `${row.kind}:${row.id}`)).size !== cash.length
  )
    throw new ReconciliationError("Select each cash record once.");
  if (
    cash.some(
      (row) =>
        row.currencyCode !== line.currencyCode ||
        row.direction !== line.direction,
    )
  )
    throw new ReconciliationError(
      "Bank and cash records must have the same currency and direction. No FX conversion is inferred.",
    );
  const total = cash.reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
  if (!total.equals(line.amount))
    throw new ReconciliationError(
      "Selected cash must equal the bank amount exactly. Fees and partial bank matches are not supported.",
    );
}
