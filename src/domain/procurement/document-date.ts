export type SupplierDocumentKind = "QUOTE" | "INVOICE";

/** Invoice and Quote dates remain separate; the current source prefers an Invoice. */
export function supplierDocumentDate(order: {
  quoteDate?: string | null;
  invoiceDate?: string | null;
}) {
  const kind: SupplierDocumentKind = order.invoiceDate ? "INVOICE" : "QUOTE";
  return {
    kind,
    field:
      kind === "INVOICE" ? ("invoiceDate" as const) : ("quoteDate" as const),
    label: kind === "INVOICE" ? "Invoice date" : "Quote date",
    date: order.invoiceDate || order.quoteDate || null,
  };
}
