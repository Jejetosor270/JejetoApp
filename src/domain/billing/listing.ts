import Decimal from "decimal.js";
import { billingStatuses } from "./status";
import {
  firstQueryValue,
  optionalUuid,
  parsePageInput,
  parseSort,
  parseSortDirection,
  selectedValue,
} from "@/domain/listing/validation";

export const billingSorts = [
  "date",
  "dueDate",
  "reference",
  "updated",
  "project",
  "totalHt",
  "paid",
  "outstanding",
  "status",
] as const;
export function billingListFilters(
  params: Record<string, string | string[] | undefined>,
) {
  return {
    ...parsePageInput(params),
    clientId: optionalUuid(firstQueryValue(params, "clientId")),
    projectId: optionalUuid(firstQueryValue(params, "projectId")),
    currencyCode: firstQueryValue(params, "currencyCode"),
    documentType: selectedValue(
      ["QUOTE", "INVOICE"] as const,
      firstQueryValue(params, "documentType"),
    ),
    status: selectedValue(billingStatuses, firstQueryValue(params, "status")),
    query: firstQueryValue(params, "query") ?? "",
    sort: parseSort(billingSorts, firstQueryValue(params, "sort"), "updated"),
    direction: parseSortDirection(firstQueryValue(params, "direction")),
  };
}

export function sortBillingRows<
  T extends {
    id: string;
    currencyCode: string;
    totalHt: string;
    paid: string;
    outstanding: string;
    dueDate: string | null;
    status: string;
    reference: string;
    documentDate: string;
    updatedAt?: string;
    project: { name: string };
  },
>(
  rows: readonly T[],
  sort: (typeof billingSorts)[number],
  direction: "asc" | "desc",
): T[] {
  return rows.toSorted((a, b) => {
    let comparison: number;
    if (sort === "totalHt" || sort === "paid" || sort === "outstanding")
      comparison =
        a.currencyCode.localeCompare(b.currencyCode) ||
        new Decimal(a[sort]).comparedTo(b[sort]);
    else {
      const key = (row: T) =>
        sort === "project"
          ? row.project.name
          : sort === "date"
            ? row.documentDate
            : sort === "updated"
              ? (row.updatedAt ?? "")
              : row[sort];
      const left = key(a),
        right = key(b);
      if (left === null || right === null)
        return left === right
          ? a.id.localeCompare(b.id)
          : left === null
            ? 1
            : -1;
      comparison = left.localeCompare(right);
    }
    return comparison
      ? comparison * (direction === "asc" ? 1 : -1)
      : a.id.localeCompare(b.id);
  });
}
