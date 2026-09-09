"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { RecordSectionHeading } from "./record-presentation";
import type { RelatedTableData } from "@/lib/related-records/types";

const PAGE_SIZE = 10;

export function RelatedRecordTable({
  table,
  actions,
  rowActions,
  firstCells,
}: {
  table: RelatedTableData;
  actions?: ReactNode;
  rowActions?: Record<string, ReactNode>;
  firstCells?: Record<string, ReactNode>;
}) {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const lastPage = Math.max(0, Math.ceil(table.rows.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = table.rows.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  return (
    <section className="bg-card rounded-lg border p-4" aria-label={table.title}>
      <RecordSectionHeading
        title={`${table.title} (${table.rows.length})`}
        description={table.description}
        actions={actions}
      />
      <div className="mt-4 overflow-x-auto rounded-md border">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="sr-only">{table.title}</caption>
          <thead className="bg-muted/40 text-muted-foreground text-xs">
            <tr>
              {table.columns.map((label, index) => (
                <th
                  key={label}
                  scope="col"
                  className={`px-3 py-2 font-medium ${table.numericColumns?.includes(index) ? "text-right" : ""}`}
                >
                  {label}
                </th>
              ))}
              {rowActions ? (
                <th scope="col" className="px-3 py-2 text-right">
                  Manage
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((row) => (
              <tr
                key={row.id}
                className={`hover:bg-muted/25 ${row.href ? "cursor-pointer" : ""}`}
                onClick={(event) => {
                  if (
                    event.target instanceof Element &&
                    event.target.closest("a, button, input, select, textarea")
                  )
                    return;
                  if (
                    event.ctrlKey ||
                    event.metaKey ||
                    event.shiftKey ||
                    window.getSelection()?.toString()
                  )
                    return;
                  if (row.href) router.push(row.href);
                }}
              >
                {row.cells.map((value, index) => (
                  <td
                    key={table.columns[index]}
                    className={`px-3 py-2 ${table.numericColumns?.includes(index) ? "financial-figure text-right" : ""}`}
                  >
                    {index === 0 && firstCells?.[row.id] ? (
                      firstCells[row.id]
                    ) : index === 0 && row.href ? (
                      <Link
                        href={row.href}
                        className="font-medium underline underline-offset-2"
                      >
                        {value}
                      </Link>
                    ) : (
                      value
                    )}
                  </td>
                ))}
                {rowActions ? (
                  <td className="px-3 py-2 text-right">{rowActions[row.id]}</td>
                ) : null}
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={table.columns.length + (rowActions ? 1 : 0)}
                  className="text-muted-foreground px-3 py-6 text-center"
                >
                  No related {table.title.toLowerCase()}.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {lastPage > 0 ? (
        <nav
          aria-label={`${table.title} pages`}
          className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <span>
            Page {currentPage + 1} of {lastPage + 1} · {table.rows.length}{" "}
            records
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage === lastPage}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}
    </section>
  );
}

export function RelatedRecords({
  tables,
  actions = {},
}: {
  tables: RelatedTableData[];
  actions?: Record<string, ReactNode>;
}) {
  return (
    <div className="space-y-4">
      {tables.map((table) => (
        <RelatedRecordTable
          key={table.id}
          table={table}
          actions={actions[table.id]}
        />
      ))}
    </div>
  );
}
