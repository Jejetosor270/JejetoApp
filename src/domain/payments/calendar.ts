import { derivePaymentStatus } from "@/domain/payments/calculations";

export type CalendarEventType =
  | "SUPPLIER_PAYMENT"
  | "CLIENT_RECEIPT"
  | "EXPECTED_READY"
  | "EXPECTED_DELIVERY"
  | "ACTUAL_DELIVERY";

export interface ProcurementCalendarEvent {
  amount: string | null;
  currencyCode: string | null;
  date: string;
  href: string;
  id: string;
  orderNumber: string;
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
  today: string;
}): ProcurementCalendarEvent[] {
  const paymentEvents = input.installments.map((item) => ({
    amount: item.scheduledAmount,
    currencyCode: item.currencyCode,
    date: item.dueDate,
    href: `/orders/${item.orderId}#payments`,
    id: `payment-${item.id}`,
    orderNumber: item.orderNumber,
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
              projectName: order.projectName,
              status: null,
              title,
              type,
            },
          ]
        : [],
    );
  });
  return [...paymentEvents, ...orderEvents].sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.title.localeCompare(right.title),
  );
}
