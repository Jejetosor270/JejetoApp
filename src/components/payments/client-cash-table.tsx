import Link from "next/link";
import type { ClientCashInstallment } from "@/lib/billing/reporting";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import { formatEnumLabel } from "@/domain/presentation/labels";

export function ClientCashTable({ items }: { items: ClientCashInstallment[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted">
          <tr>
            {[
              "Due",
              "Client",
              "Project",
              "Billing",
              "Installment",
              "Scheduled TTC",
              "Received",
              "Outstanding",
              "Status",
            ].map((label) => (
              <th key={label} className="p-3">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t">
              <td className="p-3 whitespace-nowrap">
                {formatDateOnly(item.dueDate)}
              </td>
              <td className="p-3">{item.clientName}</td>
              <td className="p-3">
                <Link href={`/projects/${item.projectId}`}>
                  {item.projectName}
                </Link>
              </td>
              <td className="p-3">
                <Link
                  className="text-primary underline"
                  href={`/billing/${item.billingDocumentId}`}
                >
                  {item.billingReference}
                </Link>
                <span className="text-muted-foreground block text-xs">
                  {item.documentType}
                </span>
              </td>
              <td className="p-3">{item.label}</td>
              <td className="p-3 whitespace-nowrap tabular-nums">
                {formatMoney(item.scheduledAmount, item.currencyCode)}
              </td>
              <td className="p-3 whitespace-nowrap tabular-nums">
                {formatMoney(item.receivedAmount ?? null, item.currencyCode)}
              </td>
              <td className="p-3 whitespace-nowrap tabular-nums">
                {formatMoney(item.outstandingAmount, item.currencyCode)}
              </td>
              <td className="p-3">{formatEnumLabel(item.status)}</td>
            </tr>
          ))}
          {!items.length ? (
            <tr>
              <td colSpan={9} className="text-muted-foreground p-6">
                No Client installments match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
