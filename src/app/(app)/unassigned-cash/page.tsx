import { requireUser, canEditMasterData } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/listing/pagination";
import {
  parsePageInput,
  queryStringFromParams,
} from "@/domain/listing/validation";
import { dateToDateOnly } from "@/domain/payments/dates";
import { UnassignedCashTable } from "@/components/payments/unassigned-cash-table";
export const metadata = { title: "Unassigned cash records" };
export default async function UnassignedCashPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const paging = parsePageInput(params);
  const db = getDatabase();
  const [records, total] = await Promise.all([
    db.unassignedCashRecord.findMany({
      orderBy: [{ cashDate: "desc" }, { id: "asc" }],
      skip: (paging.page - 1) * paging.pageSize,
      take: paging.pageSize,
    }),
    db.unassignedCashRecord.count(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Unassigned cash records"
        description="Actual cash with no document assignment. These records do not settle an Order, Billing document or Project balance."
      />
      <UnassignedCashTable
        canEdit={canEditMasterData(user.role)}
        rows={records.map((row) => ({
          id: row.id,
          reference: row.reference ?? "",
          direction: row.direction,
          date: dateToDateOnly(row.cashDate),
          amount: row.amount.toString(),
          currency: row.currencyCode,
          reportingCurrency: row.reportingCurrencyCode,
          fxRate: row.fxRateToReporting?.toString() ?? null,
        }))}
      />
      <Pagination
        pathname="/unassigned-cash"
        queryString={queryStringFromParams(params)}
        {...paging}
        total={total}
      />
    </div>
  );
}
