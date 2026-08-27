import { derivePaymentStatus } from "@/domain/payments/calculations";

export type CalendarEventType =
  | "SUPPLIER_PAYMENT"
  | "CLIENT_RECEIPT"
  | "EXPECTED_READY"
  | "EXPECTED_DELIVERY"
  | "ACTUAL_DELIVERY"
  | "ITEM_WAREHOUSE"
  | "ITEM_FABRICATOR"
  | "ITEM_RESIDENCE"
  | "ITEM_INSTALLATION";

export interface ProcurementCalendarEvent {
  amount: string | null;
  currencyCode: string | null;
  date: string;
  href: string;
  id: string;
  orderNumber: string;
  partyName: string | null;
  projectName: string;
  status: string | null;
  title: string;
  type: CalendarEventType;
}

export function buildCalendarEvents(input: {
  installments: readonly {
    currencyCode: string;
    direction: "SUPPLIER_PAYMENT" | "CLIENT_RECEIPT";
    dueDate: string;
    id: string;
    isCancelled: boolean;
    label: string;
    orderId: string;
    orderNumber: string;
    partyName: string;
    paidAmount: string;
    projectName: string;
    scheduledAmount: string;
  }[];
  orders: readonly {
    actualDeliveryDate: string | null;
    expectedDeliveryDate: string | null;
    expectedReadyDate: string | null;
    id: string;
    orderNumber: string;
    projectName: string;
  }[];
  items?: readonly {
    estimatedFabricatorDate: string | null;
    estimatedResidenceDate: string | null;
    estimatedWarehouseDate: string | null;
    id: string;
    installedDate: string | null;
    itemReference: string | null;
    name: string;
    projectName: string;
  }[];
  today: string;
}): ProcurementCalendarEvent[] {
  const paymentEvents = input.installments.map((item) => ({
    amount: item.scheduledAmount,
    currencyCode: item.currencyCode,
    date: item.dueDate,
    href: `/orders/${item.orderId}#payments`,
    id: `payment-${item.id}`,
    orderNumber: item.orderNumber,
    partyName: item.partyName,
    projectName: item.projectName,
    status: derivePaymentStatus({
      dueDate: item.dueDate,
      isCancelled: item.isCancelled,
      paidAmount: item.paidAmount,
      scheduledAmount: item.scheduledAmount,
      today: input.today,
    }),
    title: item.label,
    type: item.direction,
  }));
  const orderEvents = input.orders.flatMap((order) => {
    const dates = [
      ["EXPECTED_READY", order.expectedReadyDate, "Expected ready"],
      ["EXPECTED_DELIVERY", order.expectedDeliveryDate, "Expected delivery"],
      ["ACTUAL_DELIVERY", order.actualDeliveryDate, "Delivered"],
    ] as const;
    return dates.flatMap(([type, date, title]) =>
      date
        ? [
            {
              amount: null,
              currencyCode: null,
              date,
              href: `/orders/${order.id}`,
              id: `${type.toLowerCase()}-${order.id}`,
              orderNumber: order.orderNumber,
              partyName: null,
              projectName: order.projectName,
              status: null,
              title,
              type,
            },
          ]
        : [],
    );
  });
  const itemEvents = (input.items ?? []).flatMap((item) => {
    const dates = [
      [
        "ITEM_WAREHOUSE",
        item.estimatedWarehouseDate,
        "Item expected at warehouse",
      ],
      [
        "ITEM_FABRICATOR",
        item.estimatedFabricatorDate,
        "Item expected at fabricator",
      ],
      [
        "ITEM_RESIDENCE",
        item.estimatedResidenceDate,
        "Item expected at residence",
      ],
      ["ITEM_INSTALLATION", item.installedDate, "Item installation"],
    ] as const;
    return dates.flatMap(([type, date, title]) =>
      date
        ? [
            {
              amount: null,
              currencyCode: null,
              date,
              href: `/items/${item.id}`,
              id: `${type.toLowerCase()}-${item.id}`,
              orderNumber: item.itemReference ?? "ITEM",
              partyName: null,
              projectName: item.projectName,
              status: null,
              title: `${title} · ${item.name}`,
              type,
            },
          ]
        : [],
    );
  });
  return [...paymentEvents, ...orderEvents, ...itemEvents].sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.title.localeCompare(right.title),
  );
}
