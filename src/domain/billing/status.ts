import Decimal from "decimal.js";

export const billingStatuses = [
  "DRAFT",
  "TO_BE_INVOICED",
  "INVOICED",
  "PAID",
  "OVERDUE",
  "CANCELLED",
] as const;
export type BillingStatus = (typeof billingStatuses)[number];

export function billingIsIssued(record: {
  workflowStatus?: string;
  isCancelled: boolean;
}) {
  return (
    !record.isCancelled &&
    !["DRAFT", "TO_BE_INVOICED", "CANCELLED"].includes(
      record.workflowStatus ?? "INVOICED",
    )
  );
}

/** Cash remains authoritative; corrections reopen previously paid documents. */
export function billingStatus(input: {
  workflowStatus?: string;
  isCancelled: boolean;
  documentType: string;
  totalTtc: string;
  paid: string;
  dueDate: string | null;
  today: string;
}): BillingStatus {
  if (input.isCancelled || input.workflowStatus === "CANCELLED")
    return "CANCELLED";
  if (
    input.workflowStatus === "DRAFT" ||
    input.workflowStatus === "TO_BE_INVOICED"
  )
    return input.workflowStatus;
  if (input.documentType === "QUOTE") return "TO_BE_INVOICED";
  if (
    new Decimal(input.totalTtc).greaterThan(0) &&
    new Decimal(input.paid).greaterThanOrEqualTo(input.totalTtc)
  )
    return "PAID";
  if (
    input.workflowStatus === "OVERDUE" ||
    (input.dueDate !== null && input.dueDate < input.today)
  )
    return "OVERDUE";
  return "INVOICED";
}
