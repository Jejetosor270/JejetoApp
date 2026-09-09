export interface RelatedRow {
  id: string;
  href?: string;
  cells: string[];
}

export interface RelatedTableData {
  editKind?: RelatedEditKind;
  removal?:
    | { kind: "payment" | "receipt" }
    | {
        kind:
          | "order-buildings"
          | "order-items"
          | "billing-orders"
          | "order-billing";
        parentId: string;
      };
  id: string;
  title: string;
  description: string;
  columns: string[];
  numericColumns?: number[];
  rows: RelatedRow[];
}

export type RelatedEditKind =
  | "project"
  | "client"
  | "supplier"
  | "order"
  | "billing"
  | "payment"
  | "receipt"
  | "supplier-installment"
  | "client-installment"
  | "building"
  | "room"
  | "item"
  | "package";

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
