export interface ProjectFinancialRow {
  kind:
    "billed" | "cost" | "received" | "paid" | "issued" | "payment" | "planned";
  label: string;
  href: string;
  amount: string | null;
  due: string | null;
}
export type FinancialPeriod = "all" | "upcoming" | "overdue" | "undated";
export function projectFinancialRows(
  rows: readonly ProjectFinancialRow[],
  kinds: readonly ProjectFinancialRow["kind"][],
  period: FinancialPeriod,
  today: string,
  end: string,
) {
  return rows.filter(
    (row) =>
      kinds.includes(row.kind) &&
      (period === "all" ||
        (period === "undated" && row.due === null) ||
        (row.due !== null &&
          (period === "overdue"
            ? row.due < today
            : period === "upcoming" && row.due >= today && row.due <= end))),
  );
}
