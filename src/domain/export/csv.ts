export interface TrustedCsvValue {
  trustedValue: string;
}

export function trustedCsvValue(value: string): TrustedCsvValue {
  return { trustedValue: value };
}

export type CsvCell = string | null | undefined | TrustedCsvValue;

function protectedText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function encodedCell(cell: CsvCell): string {
  const value =
    typeof cell === "object" && cell !== null
      ? cell.trustedValue
      : protectedText(cell ?? "");
  return `"${value.replaceAll('"', '""')}"`;
}

export function csvDocument(
  headers: readonly string[],
  rows: readonly (readonly CsvCell[])[],
): string {
  return [
    headers.map(encodedCell).join(","),
    ...rows.map((row) => row.map(encodedCell).join(",")),
  ].join("\r\n");
}
