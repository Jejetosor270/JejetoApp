"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import type { ClientBillingView } from "@/lib/billing/billing";

function BillingRow({
  canEdit,
  document,
}: {
  canEdit: boolean;
  document: ClientBillingView;
}) {
  const router = useRouter();
  const href = `/billing/${document.id}`;
  return (
    <tr
      className="hover:bg-muted/30 cursor-pointer align-top"
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("a, button, input, select, textarea, form")) return;
        router.push(href);
      }}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (
          event.key === "Enter" &&
          !target.closest("a, button, input, select, textarea, form")
        )
          router.push(href);
      }}
      tabIndex={0}
    >
      <td className="px-3 py-3 font-mono text-xs">
        <Link className="underline-offset-2 hover:underline" href={href}>
          {document.reference}
        </Link>
      </td>
      <td className="px-3 py-3 font-medium">{document.client.displayName}</td>
      <td className="px-3 py-3">{document.project.name}</td>
      <td className="px-3 py-3">
        {document.documentType === "QUOTE" ? "Quote / Devis" : "Invoice"}
      </td>
      <td className="px-3 py-3">{formatDateOnly(document.documentDate)}</td>
      <td className="px-3 py-3">{formatDateOnly(document.dueDate)}</td>
      <td className="financial-figure px-3 py-3 text-right">
        {formatMoney(document.totalHt, document.currencyCode)}
      </td>
      <td className="financial-figure px-3 py-3 text-right">
        {formatMoney(document.totalTtc, document.currencyCode)}
      </td>
      <td className="financial-figure px-3 py-3 text-right">
        {formatMoney(document.paid, document.currencyCode)}
      </td>
      <td className="financial-figure px-3 py-3 text-right">
        {formatMoney(document.outstanding, document.currencyCode)}
      </td>
      <td className="px-3 py-3">{document.status.replaceAll("_", " ")}</td>
      <td className="px-3 py-3 whitespace-nowrap">
        <Link
          className="text-primary mr-3 text-xs font-medium underline"
          href={href}
        >
          View
        </Link>
        {canEdit ? (
          <Link
            className="text-primary text-xs font-medium underline"
            href={`${href}?edit=1`}
          >
            Edit
          </Link>
        ) : null}
      </td>
    </tr>
  );
}

export function BillingTable({
  canEdit,
  documents,
}: {
  canEdit: boolean;
  documents: ClientBillingView[];
}) {
  return (
    <section className="bg-card overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[78rem] text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
            <tr>
              <th className="px-3 py-3">Reference</th>
              <th className="px-3 py-3">Client</th>
              <th className="px-3 py-3">Project</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Due</th>
              <th className="px-3 py-3 text-right">HT</th>
              <th className="px-3 py-3 text-right">TTC</th>
              <th className="px-3 py-3 text-right">Received</th>
              <th className="px-3 py-3 text-right">Outstanding</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {documents.map((document) => (
              <BillingRow
                canEdit={canEdit}
                document={document}
                key={document.id}
              />
            ))}
          </tbody>
        </table>
      </div>
      {documents.length === 0 ? (
        <p className="text-muted-foreground px-4 py-10 text-sm">
          No Client billing documents match these filters.
        </p>
      ) : null}
    </section>
  );
}
