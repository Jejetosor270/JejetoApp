"use client";
import { ListEmptyState } from "@/components/listing/empty-state";

import Link from "next/link";
import { SortHeader } from "@/components/listing/sort-header";
import { useRouter } from "next/navigation";

import { formatDateOnly } from "@/domain/payments/dates";
import { formatMoney } from "@/domain/procurement/presentation";
import { formatEnumLabel } from "@/domain/presentation/labels";
import type { ClientBillingView } from "@/lib/billing/billing";
import {
  tableContainerClassName,
  tableHeaderClassName,
} from "@/components/listing/table-styles";

function BillingRow({
  canEdit,
  document,
  view,
}: {
  canEdit: boolean;
  document: ClientBillingView;
  view: "commercial" | "collection";
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
    >
      <td className="px-3 py-3 font-mono text-xs">
        <Link className="underline-offset-2 hover:underline" href={href}>
          {document.reference}
        </Link>
        <span className="text-muted-foreground mt-1 block font-sans">
          {document.documentType === "QUOTE" ? "Quote / Devis" : "Invoice"}
          {document.isCancelled ? " · Cancelled" : ""}
        </span>
      </td>
      <td className="px-3 py-3">
        {document.client.displayName}
        <span className="text-muted-foreground mt-1 block text-xs">
          {document.project.name}
        </span>
      </td>
      {view === "commercial" && (
        <td className="px-3 py-3">{formatDateOnly(document.documentDate)}</td>
      )}
      {view === "collection" && (
        <td className="px-3 py-3">{formatDateOnly(document.dueDate)}</td>
      )}
      {view === "commercial" && (
        <td className="financial-figure px-3 py-3 text-right">
          {formatMoney(document.totalHt, document.currencyCode)}
        </td>
      )}
      {view === "commercial" && (
        <td className="financial-figure px-3 py-3 text-right">
          {formatMoney(document.vatAmount, document.currencyCode)}
        </td>
      )}
      <td className="financial-figure px-3 py-3 text-right">
        {formatMoney(document.totalTtc, document.currencyCode)}
      </td>
      {view === "collection" && (
        <td className="financial-figure px-3 py-3 text-right">
          {formatMoney(document.paid, document.currencyCode)}
        </td>
      )}
      {view === "collection" && (
        <td className="financial-figure px-3 py-3 text-right">
          {formatMoney(document.outstanding, document.currencyCode)}
        </td>
      )}
      <td className="px-3 py-3">{formatEnumLabel(document.status)}</td>
      <td className="px-3 py-3 whitespace-nowrap">
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
  view,
}: {
  canEdit: boolean;
  documents: ClientBillingView[];
  view: "commercial" | "collection";
}) {
  return (
    <section className={tableContainerClassName}>
      <div
        className="max-h-[70svh] overflow-auto"
        role="region"
        aria-label="Client Billing table"
        tabIndex={0}
      >
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className={tableHeaderClassName}>
            <tr>
              <SortHeader
                className="px-3 py-3"
                label="Reference"
                field="reference"
                defaultSort="updated"
                defaultDirection="desc"
              />
              <th className="px-3 py-3">Client / Project</th>
              {view === "commercial" && (
                <SortHeader
                  className="px-3 py-3"
                  label="Date"
                  field="date"
                  defaultSort="updated"
                  defaultDirection="desc"
                />
              )}
              {view === "collection" && (
                <SortHeader
                  className="px-3 py-3"
                  label="Due"
                  field="dueDate"
                  defaultSort="updated"
                  defaultDirection="desc"
                />
              )}
              {view === "commercial" && (
                <th className="px-3 py-3 text-right">HT</th>
              )}
              {view === "commercial" && (
                <th className="px-3 py-3 text-right">VAT</th>
              )}
              <th className="px-3 py-3 text-right">TTC</th>
              {view === "collection" && (
                <th className="px-3 py-3 text-right">Received</th>
              )}
              {view === "collection" && (
                <th className="px-3 py-3 text-right">Outstanding</th>
              )}
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {documents.map((document) => (
              <BillingRow
                canEdit={canEdit}
                document={document}
                view={view}
                key={document.id}
              />
            ))}
          </tbody>
        </table>
      </div>
      {documents.length === 0 ? (
        <ListEmptyState entity="Client Billing documents" />
      ) : null}
    </section>
  );
}
