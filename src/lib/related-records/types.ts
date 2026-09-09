export interface RelatedRow {
  id: string;
  href?: string;
  editValue?: string;
  editFields?: {
    column: number;
    name: "date" | "amount" | "freight";
    value: string;
    type: "date" | "money";
    currency?: string;
  }[];
  cells: string[];
}

export interface RelatedTableData {
  editKind?: RelatedEditKind;
  editParentId?: string;
  trashKind?: Exclude<RelatedEditKind, "allocation" | "allocation-order">;
  removal?:
    | {
        kind: "cash-relationship";
        cashKind: "payment" | "receipt";
        recordId: string;
        tableId: string;
      }
    | {
        kind: "assignment";
        relation: AssignmentRelation;
        parentId: string;
        ownerId?: string;
      }
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

export type AssignmentRelation =
  | "supplier-installment-supplier"
  | "client-installment-client"
  | "item-building"
  | "item-room"
  | "item-order"
  | "item-supplier"
  | "project-client"
  | "order-project"
  | "order-supplier"
  | "billing-project"
  | "billing-client"
  | "building-project"
  | "room-building"
  | "room-project"
  | "item-project"
  | "package-project"
  | "supplier-installment-order"
  | "supplier-installment-project"
  | "client-installment-billing"
  | "client-installment-project"
  | "billing-revision";

export type RelatedEditKind =
  | "allocation"
  | "allocation-order"
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
