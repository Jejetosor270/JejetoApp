import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { ProcurementCalendarEvent } from "@/domain/payments/calendar";
import {
  addMonthsToDateOnly,
  businessToday,
  dateOnlyToDate,
  dateToDateOnly,
  formatDateOnly,
  monthBounds,
  monthGrid,
} from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import { formatEnumLabel } from "@/domain/presentation/labels";
import { requireUser } from "@/lib/auth/current-user";
import { getProcurementCalendarEvents } from "@/lib/payments/payments";

export const metadata: Metadata = { title: "Procurement calendar" };

function eventLabel(event: ProcurementCalendarEvent) {
  if (event.type === "SUPPLIER_PAYMENT") return "Cash out";
  if (event.type === "CLIENT_RECEIPT") return "Cash in";
  if (event.type === "EXPECTED_READY") return "Ready";
  if (event.type === "EXPECTED_DELIVERY") return "Delivery";
  if (event.type === "ITEM_WAREHOUSE") return "Item warehouse";
  if (event.type === "ITEM_FABRICATOR") return "Item fabricator";
  if (event.type === "ITEM_RESIDENCE") return "Item residence";
  if (event.type === "ITEM_INSTALLATION") return "Installation";
  return "Delivered";
}

function eventVariant(event: ProcurementCalendarEvent) {
  if (event.status === "OVERDUE" || event.type === "SUPPLIER_PAYMENT") {
    return "destructive" as const;
  }
  if (event.type === "CLIENT_RECEIPT") return "default" as const;
  return "outline" as const;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const today = businessToday();
  const requestedMonth =
    typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : today.slice(0, 7);
  const { start, end } = monthBounds(requestedMonth);
  const nextThirtyDate = dateOnlyToDate(today);
  nextThirtyDate.setUTCDate(nextThirtyDate.getUTCDate() + 30);
  const nextThirty = dateToDateOnly(nextThirtyDate);
  const [, monthEvents, operationalEvents] = await Promise.all([
    requireUser(),
    getProcurementCalendarEvents(start, end),
    getProcurementCalendarEvents("2000-01-01", nextThirty),
  ]);
  const byDate = new Map<string, ProcurementCalendarEvent[]>();
  for (const event of monthEvents) {
    byDate.set(event.date, [...(byDate.get(event.date) ?? []), event]);
  }
  const paymentEvents = operationalEvents.filter(
    (event) =>
      event.type === "SUPPLIER_PAYMENT" || event.type === "CLIENT_RECEIPT",
  );
  const overdue = paymentEvents.filter(
    (event) =>
      event.date < today &&
      event.status !== "PAID" &&
      event.status !== "CANCELLED",
  );
  const nextSevenDate = dateOnlyToDate(today);
  nextSevenDate.setUTCDate(nextSevenDate.getUTCDate() + 7);
  const nextSeven = dateToDateOnly(nextSevenDate);
  const nextSevenEvents = paymentEvents.filter(
    (event) => event.date >= today && event.date <= nextSeven,
  );
  const nextThirtyEvents = paymentEvents.filter(
    (event) => event.date > nextSeven && event.date <= nextThirty,
  );
  const previousMonth = addMonthsToDateOnly(`${requestedMonth}-01`, -1).slice(
    0,
    7,
  );
  const followingMonth = addMonthsToDateOnly(`${requestedMonth}-01`, 1).slice(
    0,
    7,
  );
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-primary text-xs font-medium tracking-[0.08em] uppercase">
            Operations
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Procurement calendar
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Derived automatically from payment due dates and Supplier Order
            timing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            className="border-input rounded-lg border px-3 py-2 text-sm"
            href={`/calendar?month=${previousMonth}`}
          >
            Previous
          </Link>
          <span className="min-w-32 text-center text-sm font-semibold">
            {dateOnlyToDate(start).toLocaleDateString("en-GB", {
              month: "long",
              timeZone: "UTC",
              year: "numeric",
            })}
          </span>
          <Link
            className="border-input rounded-lg border px-3 py-2 text-sm"
            href={`/calendar?month=${followingMonth}`}
          >
            Next
          </Link>
        </div>
      </header>
      <section className="overflow-x-auto rounded-lg border">
        <div className="bg-muted/40 grid min-w-[58rem] grid-cols-7 text-xs font-medium">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <div className="border-r px-2 py-2 last:border-r-0" key={day}>
              {day}
            </div>
          ))}
        </div>
        <div className="grid min-w-[58rem] grid-cols-7">
          {monthGrid(requestedMonth).map((day) => (
            <div
              className={`min-h-28 border-t border-r p-2 nth-[7n]:border-r-0 ${day.inMonth ? "bg-background" : "bg-muted/20 text-muted-foreground"}`}
              key={day.date}
            >
              <p
                className={`text-xs ${day.date === today ? "text-primary font-bold" : ""}`}
              >
                {Number(day.date.slice(8, 10))}
              </p>
              <div className="mt-1 space-y-1">
                {(byDate.get(day.date) ?? []).slice(0, 4).map((event) => (
                  <Link
                    className="hover:bg-muted block rounded border p-1.5 text-[0.6875rem] leading-tight"
                    href={event.href}
                    key={event.id}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <Badge variant={eventVariant(event)}>
                        {eventLabel(event)}
                      </Badge>
                      <span className="font-mono">{event.orderNumber}</span>
                    </div>
                    <p className="mt-1 truncate font-medium">{event.title}</p>
                    {event.partyName ? (
                      <p className="text-muted-foreground mt-0.5 truncate">
                        {event.partyName} ·{" "}
                        {event.status ? formatEnumLabel(event.status) : ""}
                      </p>
                    ) : null}
                    {event.amount && event.currencyCode ? (
                      <p className="financial-figure mt-1">
                        {formatMoney(event.amount, event.currencyCode)}
                      </p>
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        {monthEvents.length === 0 ? (
          <p className="text-muted-foreground border-t px-4 py-8 text-center text-sm">
            No procurement events for this period.
          </p>
        ) : null}
      </section>
      <section className="grid gap-4 xl:grid-cols-3">
        {[
          ["Overdue", overdue],
          ["Next 7 days", nextSevenEvents],
          ["Following 30 days", nextThirtyEvents],
        ].map(([title, events]) => (
          <article
            className="bg-card rounded-lg border p-4"
            key={title as string}
          >
            <h2 className="text-sm font-semibold">{title as string}</h2>
            <div className="mt-3 space-y-2">
              {(events as ProcurementCalendarEvent[])
                .slice(0, 12)
                .map((event) => (
                  <Link
                    className="hover:bg-muted/40 flex items-start justify-between gap-3 rounded-md border p-2 text-sm"
                    href={event.href}
                    key={event.id}
                  >
                    <span>
                      <span className="font-medium">{event.title}</span>
                      <span className="text-muted-foreground mt-0.5 block text-xs">
                        {event.projectName} · {event.orderNumber}
                      </span>
                      {event.partyName ? (
                        <span className="text-muted-foreground mt-0.5 block text-xs">
                          {event.partyName} ·{" "}
                          {event.status ? formatEnumLabel(event.status) : ""}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-right text-xs">
                      <span>{formatDateOnly(event.date)}</span>
                      {event.amount && event.currencyCode ? (
                        <span className="financial-figure mt-0.5 block">
                          {formatMoney(event.amount, event.currencyCode)}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                ))}
              {(events as ProcurementCalendarEvent[]).length === 0 ? (
                <p className="text-muted-foreground text-xs">No events.</p>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
