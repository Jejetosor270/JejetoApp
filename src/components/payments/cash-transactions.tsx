import Link from "next/link";
import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import type { CashTransaction } from "@/lib/payments/transactions";

export function CashTransactions({ items }: { items: CashTransaction[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted">
          <tr>
            {[
              "Date",
              "Direction",
              "Project",
              "Counterparty",
              "Source",
              "Installment",
              "Amount",
              "Reference",
              "Notes",
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
                {formatDateOnly(item.date)}
              </td>
              <td className="p-3 font-medium">
                {item.direction === "IN"
                  ? "Cash In · Client receipt"
                  : "Cash Out · Supplier settlement"}
              </td>
              <td className="p-3">
                <Link href={`/projects/${item.projectId}`}>
                  {item.projectName}
                </Link>
              </td>
              <td className="p-3">{item.counterpartyName}</td>
              <td className="p-3">
                <Link
                  className="text-primary underline"
                  href={`/${item.direction === "IN" ? "billing" : "orders"}/${item.documentId}`}
                >
                  {item.documentReference}
                </Link>
                <span className="text-muted-foreground block text-xs">
                  {item.sourceType}
                </span>
              </td>
              <td className="p-3">{item.installment ?? "Document-level"}</td>
              <td className="p-3 text-right whitespace-nowrap tabular-nums">
                {formatMoney(item.amount, item.currencyCode)}
              </td>
              <td className="p-3">{item.reference ?? "—"}</td>
              <td className="max-w-64 p-3">{item.notes ?? "—"}</td>
            </tr>
          ))}
          {!items.length ? (
            <tr>
              <td colSpan={9} className="text-muted-foreground p-6">
                No actual transactions match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
