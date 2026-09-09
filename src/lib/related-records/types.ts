export interface RelatedRow {
  id: string;
  href?: string;
  cells: string[];
}

export interface RelatedTableData {
  id: string;
  title: string;
  description: string;
  columns: string[];
  numericColumns?: number[];
  rows: RelatedRow[];
}

export type CashRecordKind =
  "payment" | "receipt" | "supplier-installment" | "client-installment";

export function relatedHref(
  kind: "project" | "order" | "billing" | CashRecordKind,
  id: string,
): string {
  const prefixes = {
    project: "/projects/",
    order: "/orders/",
    billing: "/billing/",
    payment: "/payments/",
    receipt: "/receipts/",
    "supplier-installment": "/installments/supplier/",
    "client-installment": "/installments/client/",
  };
  return `${prefixes[kind]}${encodeURIComponent(id)}?tab=related`;
}
