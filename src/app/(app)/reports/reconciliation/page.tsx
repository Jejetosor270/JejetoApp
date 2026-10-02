import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImportBank } from "@/components/reconciliation/import-bank";
import { MatchBank } from "@/components/reconciliation/match-bank";
import { getBankImport, listBankImports } from "@/lib/reconciliation/service";
import { getDatabase } from "@/lib/db";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { formatMoney } from "@/domain/procurement/presentation";
import { formatDateOnly, formatTimestampDate } from "@/domain/payments/dates";

export const metadata: Metadata = { title: "Bank reconciliation" };
export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const page =
    typeof params.page === "string" && /^\d+$/.test(params.page)
      ? Math.min(100000, Math.max(1, Number(params.page)))
      : 1;
  const id = typeof params.import === "string" ? params.import : undefined;
  if (id && !z.uuid().safeParse(id).success) notFound();
  const [imports, currencies, statement] = await Promise.all([
    listBankImports(),
    getDatabase().currency.findMany({
      select: { code: true },
      orderBy: { code: "asc" },
    }),
    id ? getBankImport(id, page) : null,
  ]);
  if (id && !statement) notFound();
  const editable = canEditMasterData(user.role);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank reconciliation"
        description="Match reviewed bank transactions to existing cash. This is not a bank balance or a cash-entry screen."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/reports?view=payments">Cash transactions</Link>
            </Button>
            {editable && (
              <ImportBank currencies={currencies.map((row) => row.code)} />
            )}
          </>
        }
      />
      <details className="rounded-md border p-4" open={!statement}>
        <summary className="cursor-pointer text-sm font-medium">
          Recent imports
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left">Account</th>
                <th className="p-2 text-left">Imported</th>
                <th className="p-2 text-right">Rows</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="p-2">
                    <Link
                      className="text-primary underline"
                      href={`/reports/reconciliation?import=${item.id}`}
                    >
                      {item.accountLabel} · {item.currencyCode}
                    </Link>
                  </td>
                  <td className="p-2">{formatTimestampDate(item.createdAt)}</td>
                  <td className="p-2 text-right tabular-nums">
                    {item._count.lines}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!imports.length && (
            <p className="text-muted-foreground py-3 text-sm">
              No bank imports yet.{" "}
              {editable
                ? "Import a CSV to review and match existing cash."
                : "An ADMIN or MANAGER can import reviewed bank rows."}
            </p>
          )}
          <p className="text-muted-foreground mt-2 text-xs">
            Latest 50 imports. Saved import links remain available.
          </p>
        </div>
      </details>
      {statement && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">
            {statement.accountLabel} · {statement.currencyCode}
          </h2>
          <p className="text-muted-foreground text-sm">
            Match exact amounts in the bank currency. Fees, transfers, refunds
            and missing cash may remain unmatched; no balancing entries are
            created.
          </p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3 text-left">Booked</th>
                  <th className="p-3 text-left">Reference / description</th>
                  <th className="p-3 text-left">Direction</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-left">Match</th>
                  <th className="p-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {statement.lines.map((line) => (
                  <tr key={line.id} className="border-t">
                    <td className="p-3 whitespace-nowrap">
                      {formatDateOnly(line.bookedAt)}
                    </td>
                    <td className="max-w-xs p-3 break-words">
                      {line.reference || "—"}
                      <div className="text-muted-foreground text-xs">
                        {line.description}
                      </div>
                      {line.possibleDuplicate && (
                        <Badge variant="warning">Possible duplicate</Badge>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {line.direction === "CLIENT_RECEIPT"
                        ? "Money in"
                        : "Money out"}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap tabular-nums">
                      {formatMoney(line.amount, statement.currencyCode)}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          line.status === "MATCHED"
                            ? "success"
                            : line.status === "NEEDS_REVIEW"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {line.status === "MATCHED"
                          ? "Matched"
                          : line.status === "NEEDS_REVIEW"
                            ? "Needs review"
                            : "Unmatched"}
                      </Badge>
                      {line.matches.map(
                        (match) =>
                          match.cash && (
                            <Link
                              key={`${match.kind}:${match.id}`}
                              href={match.cash.href}
                              className="text-primary mt-1 block text-xs underline"
                            >
                              {match.cash.label}
                            </Link>
                          ),
                      )}
                    </td>
                    <td className="p-3">
                      {editable ? (
                        <MatchBank
                          line={line}
                          currencyCode={statement.currencyCode}
                        />
                      ) : (
                        "Read only"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!statement.lines.length && (
              <p className="p-4 text-sm">No rows on this page.</p>
            )}
          </div>
          <nav
            aria-label="Bank rows pages"
            className="flex items-center gap-3 text-sm"
          >
            {page > 1 && (
              <Link
                className="text-primary underline"
                href={`/reports/reconciliation?import=${statement.id}&page=${page - 1}`}
              >
                Previous
              </Link>
            )}
            <span>
              Page {page} · {statement.total} rows
            </span>
            {page * 30 < statement.total && (
              <Link
                className="text-primary underline"
                href={`/reports/reconciliation?import=${statement.id}&page=${page + 1}`}
              >
                Next
              </Link>
            )}
          </nav>
        </section>
      )}
    </div>
  );
}
