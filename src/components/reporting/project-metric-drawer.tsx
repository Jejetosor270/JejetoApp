"use client";

import Link from "next/link";
import { EditorDrawer } from "@/components/forms/editor-drawer";
import type { ProjectMetric } from "@/domain/finance/project-dashboard";
import { hasDisplayRoundingDifference } from "@/domain/finance/project-visuals";
import { formatMoney } from "@/domain/procurement/presentation";

export function ProjectMetricDrawer({
  title,
  metric,
  currency,
  onClose,
}: {
  title: string;
  metric: ProjectMetric;
  currency: string;
  onClose: () => void;
}) {
  return (
    <EditorDrawer
      open
      title={title}
      description="Exact sources for this figure."
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <p className="text-muted-foreground text-sm">{metric.help}</p>
      <p className="financial-figure mt-4 text-2xl font-semibold">
        {formatMoney(metric.value, currency, "Needs review")}
      </p>
      <div className="mt-5 overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <caption className="sr-only">
            {title} supporting records in {currency}
          </caption>
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Source
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {metric.rows.map((row, index) => (
              <tr key={`${row.href}:${index}`}>
                <td className="max-w-sm px-3 py-3">
                  <Link
                    className="text-primary break-words underline underline-offset-4"
                    href={row.href}
                  >
                    {row.label}
                  </Link>
                  {row.note && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {row.note}
                    </p>
                  )}
                </td>
                <td className="financial-figure px-3 py-3 text-right whitespace-nowrap">
                  {formatMoney(row.amount, currency, "Check source")}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted border-t">
            <tr>
              <th scope="row" className="px-3 py-3 text-left">
                Total
              </th>
              <td className="financial-figure px-3 py-3 text-right font-semibold whitespace-nowrap">
                {formatMoney(metric.value, currency, "Needs review")}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {metric.rows.length === 0 && (
        <p className="text-muted-foreground mt-3 text-sm">
          No contributing records.
        </p>
      )}
      {metric.value === null && (
        <p className="text-warning mt-3 text-sm">
          Open the marked sources to review missing FX, estimates or source
          data. Missing amounts are not zero.
        </p>
      )}
      {hasDisplayRoundingDifference(
        metric.rows.map((row) => row.amount),
        metric.value,
      ) && (
        <p className="text-muted-foreground mt-3 text-xs">
          Rows are rounded to cents. The total uses full stored precision.
        </p>
      )}
    </EditorDrawer>
  );
}
