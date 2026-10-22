import "server-only";
import { getDatabase } from "@/lib/db";
import { loadCreditSource, sourceCreditPosition } from "./source";
import { refundExpectations } from "@/domain/credits/refund-expectations";
import { businessToday, dateOnlyToDate } from "@/domain/payments/dates";
import type { ProcurementCalendarEvent } from "@/domain/payments/calendar";

/** Derive reminders from reviewed refund dates, never a second stored schedule. */
export async function getRefundCalendarEvents(
  from: string,
  to: string,
): Promise<ProcurementCalendarEvent[]> {
  const db = getDatabase();
  const candidates = await db.financialCredit.findMany({
    where: {
      isCancelled: false,
      expectedRefundDate: {
        gte: dateOnlyToDate(from),
        lte: dateOnlyToDate(to),
      },
    },
    select: {
      side: true,
      orderId: true,
      billingDocumentId: true,
      order: {
        select: {
          project: { select: { name: true } },
          supplier: { select: { displayName: true } },
        },
      },
      billingDocument: {
        select: {
          project: { select: { name: true } },
          client: { select: { displayName: true } },
        },
      },
    },
  });
  const sources = new Map(
    candidates.map((row) => [
      `${row.side}:${row.orderId ?? row.billingDocumentId}`,
      row,
    ]),
  );
  const groups = await Promise.all(
    [...sources.values()].map(async (candidate) => {
      const side = candidate.side === "SUPPLIER" ? "SUPPLIER" : "CLIENT";
      const sourceId =
        side === "SUPPLIER" ? candidate.orderId : candidate.billingDocumentId;
      if (!sourceId) return [];
      const source = await loadCreditSource(db, { side, sourceId });
      if (!source.eligible || source.blockedReason) return [];
      const expected = refundExpectations(
        source.credits,
        sourceCreditPosition(source).cash.refundDue,
      );
      return expected.flatMap((row): ProcurementCalendarEvent[] => {
        if (!row.dueDate || row.dueDate < from || row.dueDate > to) return [];
        return [
          {
            id: `refund-${side.toLowerCase()}-${sourceId}-${row.id}`,
            type: side === "SUPPLIER" ? "SUPPLIER_REFUND" : "CLIENT_REFUND",
            title: row.reference ?? "Refund",
            orderNumber: source.reference,
            date: row.dueDate,
            amount: row.amount,
            currencyCode: source.currencyCode,
            href: `/${side === "SUPPLIER" ? "orders" : "billing"}/${sourceId}?tab=related#credits`,
            projectName:
              candidate.order?.project?.name ??
              candidate.billingDocument?.project?.name ??
              "Unassigned",
            partyName:
              candidate.order?.supplier?.displayName ??
              candidate.billingDocument?.client?.displayName ??
              "Unassigned",
            status: row.dueDate < businessToday() ? "OVERDUE" : "UPCOMING",
          },
        ];
      });
    }),
  );
  return groups.flat();
}
