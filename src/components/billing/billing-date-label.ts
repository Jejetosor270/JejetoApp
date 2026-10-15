export function billingDocumentDateLabel(
  documentType: string,
  workflowStatus: string,
): string {
  if (documentType === "QUOTE") return "Quote date";
  return workflowStatus === "TO_BE_INVOICED"
    ? "Planned invoice date"
    : "Invoice date";
}
