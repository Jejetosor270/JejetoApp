import Link from "next/link";
import type { ClientCashInstallment } from "@/lib/billing/reporting";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import { formatEnumLabel } from "@/domain/presentation/labels";
import {
  tableHeaderClassName,
  tableRowClassName,
} from "@/components/listing/table-styles";
import { ListEmptyState } from "@/components/listing/empty-state";
import { Badge } from "@/components/ui/badge";

export function ClientCashTable({ items }: { items: ClientCashInstallment[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className={tableHeaderClassName}>
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
            ].map((label, index) => (
              <th
                key={label}
                scope="col"
                className={index >= 5 && index <= 7 ? "p-3 text-right" : "p-3"}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={`border-t ${tableRowClassName}`}>
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
                  {item.documentType
                    ? formatEnumLabel(item.documentType)
                    : null}
                </span>
              </td>
              <td className="p-3">{item.label}</td>
              <td className="financial-figure p-3 text-right">
                {formatMoney(item.scheduledAmount, item.currencyCode)}
              </td>
              <td className="financial-figure p-3 text-right">
                {formatMoney(item.receivedAmount ?? null, item.currencyCode)}
              </td>
              <td className="financial-figure p-3 text-right">
                {formatMoney(item.outstandingAmount, item.currencyCode)}
              </td>
              <td className="p-3">
                <Badge
                  variant={
                    item.status === "OVERDUE" ? "destructive" : "outline"
                  }
                >
                  {formatEnumLabel(item.status)}
                </Badge>
              </td>
            </tr>
          ))}
          {!items.length ? (
            <tr>
              <td colSpan={9}>
                <ListEmptyState entity="Client installments" />
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
