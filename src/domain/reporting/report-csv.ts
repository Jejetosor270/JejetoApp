import Decimal from "decimal.js";
import { csvDocument, trustedCsvValue } from "@/domain/export/csv";
import type { ReportExportOptions } from "./export-options";

export interface ReportCsvRow {
  type: string;
  metric: string;
  amount: string | null;
  currency: string;
  project?: string;
  reference?: string | undefined;
  source?: string | undefined;
  date?: string | null;
  start?: string;
  end?: string;
  status?: string | undefined;
  notes?: string;
}

/** Only validated Decimal amounts bypass spreadsheet formula protection. */
export function reportCsv(
  rows: readonly ReportCsvRow[],
  options: ReportExportOptions,
  today: string,
  exportedAt: string,
) {
  return csvDocument(
    [
      "Report",
      "Exported at UTC",
      "As of date",
      "Project filter",
      "Client filter",
      "Supplier filter",
      "Project status filter",
      "Cash direction filter",
      "Cash-in delay days",
      "Type",
      "Period from",
      "Period to",
      "Date / month",
      "Project",
      "Reference",
      "Metric",
      "Amount",
      "Currency / unit",
      "Status",
      "Source",
      "Notes",
    ],
    rows.map((row) => [
      options.dataset,
      exportedAt,
      today,
      options.projectId ?? "",
      options.clientId ?? "",
      options.supplierId ?? "",
      options.projectStatus ?? "",
      options.dataset === "transactions" ? (options.direction ?? "") : "",
      ["summary", "forecast"].includes(options.dataset)
        ? options.cashDelay
        : "",
      row.type,
      row.start ?? "",
      row.end ?? today,
      row.date ?? "",
      row.project ?? "",
      row.reference ?? "",
      row.metric,
      row.amount === null
        ? ""
        : trustedCsvValue(new Decimal(row.amount).toFixed()),
      row.currency,
      row.amount === null
        ? (row.status ?? "INCOMPLETE")
        : (row.status ?? "COMPLETE"),
      row.source ?? "",
      row.notes ?? "",
    ]),
  );
}
