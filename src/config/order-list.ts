import { financialLabels } from "@/domain/presentation/labels";
export const orderSortLabels = {
  updated: "Updated date",
  reference: "Reference",
  orderDate: "Order date",
  invoiceDate: "Invoice date",
  documentDate: "Supplier document date",
  project: "Project",
  package: "Package",
  supplier: "Supplier",
  status: "Delivery status",
  purchase: "Purchase HT",
  paymentStatus: "Payment status",
  dueDate: "Next payment due",
  expectedDelivery: "Expected delivery",
  economicCost: "Economic Landed Cost HT",
  sell: "Total Order Sell HT",
  markup: "Planned Markup",
  payable: "Payable TTC",
  scheduled: "Scheduled TTC",
  paid: financialLabels.supplierPaid,
  outstanding: financialLabels.remaining,
  expectedReady: "Expected ready",
  carrier: "Carrier",
  tracking: "Tracking reference",
} as const;

export type OrderSort = keyof typeof orderSortLabels;
export const orderSortFields = Object.keys(orderSortLabels) as OrderSort[];
// Keep historical sort URLs valid without presenting retired date choices.
export const visibleOrderSortFields: readonly OrderSort[] =
  orderSortFields.filter(
    (field) =>
      field !== "orderDate" &&
      field !== "invoiceDate" &&
      field !== "expectedReady",
  );
export type OrderViewMode =
  "general" | "financial" | "supplier-payment" | "delivery";
export const orderViewColumns: Record<OrderViewMode, readonly OrderSort[]> = {
  general: [
    "reference",
    "project",
    "package",
    "supplier",
    "status",
    "purchase",
    "paymentStatus",
    "documentDate",
    "dueDate",
    "expectedDelivery",
  ],
  financial: [
    "reference",
    "supplier",
    "project",
    "package",
    "purchase",
    "economicCost",
    "sell",
    "markup",
  ],
  "supplier-payment": [
    "supplier",
    "reference",
    "project",
    "package",
    "payable",
    "scheduled",
    "paid",
    "outstanding",
    "dueDate",
    "paymentStatus",
  ],
  delivery: [
    "reference",
    "status",
    "expectedDelivery",
    "supplier",
    "project",
    "package",
    "carrier",
    "tracking",
  ],
};
export const orderNumericColumns: readonly OrderSort[] = [
  "purchase",
  "economicCost",
  "sell",
  "markup",
  "payable",
  "scheduled",
  "paid",
  "outstanding",
];
