import Decimal from "decimal.js";
import {
  bankLineSchema,
  MAX_BANK_ROWS,
  MAX_CSV_BYTES,
  ReconciliationError,
  type BankLine,
} from "./schema";
import { isDateOnly } from "@/domain/payments/dates";

export interface CsvMapping {
  date: number;
  amount: number;
  debit: number;
  credit: number;
  reference: number;
  description: number;
  transactionId: number;
  dateFormat: "ISO" | "DMY" | "MDY";
  decimalSeparator: "." | ",";
  amountMode: "SIGNED" | "DEBIT_CREDIT";
}

/** Bounded RFC-style CSV parsing; no formula evaluation, files or network access. */
export function parseBankCsv(
  text: string,
  delimiter: "," | ";" | "\t",
): string[][] {
  if (new TextEncoder().encode(text).byteLength > MAX_CSV_BYTES)
    throw new ReconciliationError("CSV must be 4 MiB or smaller.");
  const source = text.replace(/^\uFEFF/, "");
  if (source.includes("\0") || source.includes("\uFFFD"))
    throw new ReconciliationError("Use a UTF-8 text CSV export.");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  function finishCell() {
    if (cell.length > 10000 || row.length >= 80)
      throw new ReconciliationError(
        "CSV has an oversized field or too many columns.",
      );
    row.push(cell);
    cell = "";
    closed = false;
  }
  function finishRow() {
    finishCell();
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    row = [];
    if (rows.length > MAX_BANK_ROWS + 1)
      throw new ReconciliationError(
        `Import at most ${MAX_BANK_ROWS} bank rows at a time.`,
      );
  }
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (char === delimiter) finishCell();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      finishRow();
    } else if (char === '"' && cell === "" && !closed) quoted = true;
    else if (closed || char === '"')
      throw new ReconciliationError("CSV contains malformed quoted fields.");
    else cell += char;
  }
  if (quoted)
    throw new ReconciliationError("CSV contains an unclosed quoted field.");
  if (cell !== "" || row.length || closed) finishRow();
  if (rows.length < 2)
    throw new ReconciliationError(
      "CSV needs a header and at least one bank row.",
    );
  const width = rows[0]?.length;
  if (rows.some((values) => values.length !== width))
    throw new ReconciliationError(
      "CSV rows have inconsistent columns. Check the delimiter.",
    );
  return rows;
}

function parseAmount(value: string, separator: "." | ","): Decimal {
  const compact = value.trim().replace(/[\s\u00a0\u202f]/g, "");
  const pattern =
    separator === "." ? /^[+-]?\d+(?:\.\d{1,4})?$/ : /^[+-]?\d+(?:,\d{1,4})?$/;
  if (!pattern.test(compact))
    throw new ReconciliationError(
      "Invalid amount. Select the correct decimal convention; punctuation grouping separators are not accepted.",
    );
  return new Decimal(compact.replace(",", "."));
}

function parseDate(value: string, format: CsvMapping["dateFormat"]): string {
  let date = value.trim();
  if (format !== "ISO") {
    const match = /^(\d{2})[/.\-](\d{2})[/.\-](\d{4})$/.exec(date);
    if (!match)
      throw new ReconciliationError("Invalid date for the selected format.");
    const [, first, second, year] = match;
    date = `${year}-${format === "DMY" ? second : first}-${format === "DMY" ? first : second}`;
  }
  if (!isDateOnly(date)) throw new ReconciliationError("Invalid booking date.");
  return date;
}

export function mapBankRows(
  rows: readonly string[][],
  mapping: CsvMapping,
): BankLine[] {
  const indexes = [
    mapping.date,
    ...(mapping.amountMode === "SIGNED"
      ? [mapping.amount]
      : [mapping.debit, mapping.credit]),
  ];
  const width = rows[0]?.length ?? 0;
  if (
    indexes.some(
      (index) => !Number.isInteger(index) || index < 0 || index >= width,
    ) ||
    new Set(indexes).size !== indexes.length
  )
    throw new ReconciliationError(
      "Map separate date and amount columns before previewing.",
    );
  return rows.slice(1).map((row, index) => {
    try {
      const field = (column: number) =>
        column < 0 ? "" : (row[column] ?? "").trim();
      let amount: Decimal;
      if (mapping.amountMode === "SIGNED")
        amount = parseAmount(field(mapping.amount), mapping.decimalSeparator);
      else {
        const debit = field(mapping.debit)
          ? parseAmount(field(mapping.debit), mapping.decimalSeparator)
          : new Decimal(0);
        const credit = field(mapping.credit)
          ? parseAmount(field(mapping.credit), mapping.decimalSeparator)
          : new Decimal(0);
        if (
          debit.isNegative() ||
          credit.isNegative() ||
          (debit.greaterThan(0) && credit.greaterThan(0))
        )
          throw new ReconciliationError(
            "Use a positive debit OR credit, not both.",
          );
        amount = credit.minus(debit);
      }
      const result = bankLineSchema.safeParse({
        rowNumber: index + 1,
        bookedAt: parseDate(field(mapping.date), mapping.dateFormat),
        direction: amount.isNegative() ? "SUPPLIER_PAYMENT" : "CLIENT_RECEIPT",
        amount: amount.abs().toFixed(),
        reference: field(mapping.reference),
        description: field(mapping.description),
        bankTransactionId: field(mapping.transactionId),
      });
      if (!result.success)
        throw new ReconciliationError(
          "Amount is zero/too large, or text exceeds its field limit.",
        );
      return result.data;
    } catch (error) {
      throw new ReconciliationError(
        `Row ${index + 2}: ${error instanceof ReconciliationError ? error.message : "Invalid row."}`,
      );
    }
  });
}
