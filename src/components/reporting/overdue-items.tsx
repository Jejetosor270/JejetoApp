import Link from "next/link";

import { PaymentDirection } from "@/generated/prisma/client";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import type { OverdueReportingItem } from "@/lib/reporting/reports";

function OverdueTable({
  direction,
  items,
}: {
  direction: PaymentDirection;
  items: readonly OverdueReportingItem[];
}) {
  const supplier = direction === PaymentDirection.SUPPLIER_PAYMENT;
  const relevant = items.filter((item) => item.direction === direction);
  return (
    <article className="overflow-hidden rounded-lg border">
      <header className="bg-muted/25 border-b px-3 py-2.5">
        <h3 className="text-xs font-semibold tracking-wide uppercase">
          {supplier ? "Supplier payments overdue" : "Client receipts overdue"}
        </h3>
      </header>
      {relevant.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-xs">
            <thead className="text-muted-foreground border-b">
              <tr>
                <th className="px-3 py-2">Project / Order</th>
                <th className="px-3 py-2">Party</th>
                <th className="px-3 py-2">Installment</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2 text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {relevant.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2">
                    <Link
                      className="font-medium hover:underline"
                      href={`/orders/${item.orderId}#payments`}
                    >
                      {item.projectName}
                    </Link>
                    <span className="text-muted-foreground block font-mono">
                      {item.orderNumber}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {supplier ? item.supplierName : item.clientName}
                  </td>
                  <td className="px-3 py-2">{item.label}</td>
                  <td className="px-3 py-2">
                    {formatDateOnly(item.dueDate)}
                    <span className="text-destructive block">
                      {item.daysOverdue} day(s) overdue
                    </span>
                  </td>
                  <td className="financial-figure px-3 py-2 text-right">
                    {formatMoney(item.amount, item.currencyCode)}
                    {item.amount === null ? (
                      <span className="text-destructive block">Missing FX</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground px-3 py-6 text-xs">
          No overdue {supplier ? "supplier payments" : "client receipts"}.
        </p>
      )}
    </article>
  );
}

export function OverdueItems({
  items,
}: {
  items: readonly OverdueReportingItem[];
}) {
  return (
    <section className="bg-card rounded-lg border p-4" id="overdue">
      <h2 className="text-sm font-semibold">Overdue items</h2>
      <p className="text-muted-foreground mt-1 text-xs">
        Derived from current outstanding installment balances and due dates.
      </p>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <OverdueTable
          direction={PaymentDirection.SUPPLIER_PAYMENT}
          items={items}
        />
        <OverdueTable
          direction={PaymentDirection.CLIENT_RECEIPT}
          items={items}
        />
      </div>
    </section>
  );
}
