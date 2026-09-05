import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import {
  firstQueryValue,
  optionalUuid,
  parsePageInput,
} from "@/domain/listing/validation";
import { isDateOnly } from "@/domain/payments/dates";

export interface CashTransaction {
  id: string;
  date: string;
  direction: "IN" | "OUT";
  projectId: string;
  projectName: string;
  counterpartyId: string;
  counterpartyName: string;
  documentId: string;
  documentReference: string;
  sourceType: string;
  installment: string | null;
  amount: string;
  currencyCode: string;
  reference: string | null;
  notes: string | null;
  orderId: string | null;
  billingId: string | null;
}

export function transactionQuery(
  params: Record<string, string | string[] | undefined>,
) {
  const text = (key: string) => firstQueryValue(params, key);
  const page = parsePageInput(params);
  const clauses: Prisma.Sql[] = [];
  for (const key of [
    "projectId",
    "counterpartyId",
    "orderId",
    "billingId",
  ] as const) {
    const value = optionalUuid(text(key));
    if (value)
      clauses.push(Prisma.sql`${Prisma.raw(`"${key}"`)} = ${value}::uuid`);
  }
  const direction = text("direction");
  if (direction === "IN" || direction === "OUT")
    clauses.push(Prisma.sql`direction = ${direction}`);
  const from = text("dateFrom"),
    to = text("dateTo");
  if (from && isDateOnly(from)) clauses.push(Prisma.sql`date >= ${from}`);
  if (to && isDateOnly(to)) clauses.push(Prisma.sql`date <= ${to}`);
  const reference = text("reference")?.trim();
  if (reference)
    clauses.push(
      Prisma.sql`(strpos(lower(coalesce(reference, '')), lower(${reference})) > 0 OR strpos(lower("documentReference"), lower(${reference})) > 0)`,
    );
  const source = Prisma.sql`
    SELECT 'receipt:' || r.id::text AS id, r."receivedAt"::text AS date, 'IN' AS direction,
      p.id AS "projectId", p.name AS "projectName", c.id AS "counterpartyId", c."displayName" AS "counterpartyName",
      b.id AS "documentId", b.reference AS "documentReference", b."documentType"::text AS "sourceType", i.label AS installment,
      r.amount::text AS amount, b."currencyCode", r.reference, r.notes, NULL::uuid AS "orderId", b.id AS "billingId"
    FROM client_receipts r JOIN client_billing_documents b ON b.id = r."billingDocumentId"
    JOIN projects p ON p.id = b."projectId" JOIN clients c ON c.id = b."clientId"
    LEFT JOIN client_payment_installments i ON i.id = r."installmentId"
    UNION ALL
    SELECT 'settlement:' || s.id::text, s."settledAt"::text, 'OUT', p.id, p.name, v.id, v."displayName",
      o.id, o."orderNumber", 'ORDER', i.label, s.amount::text, i."currencyCode", s.reference, s.notes, o.id, NULL::uuid
    FROM payment_settlements s JOIN payment_installments i ON i.id = s."installmentId"
    JOIN procurement_orders o ON o.id = i."orderId" JOIN projects p ON p.id = o."projectId"
    JOIN suppliers v ON v.id = o."supplierId" WHERE i.direction = 'SUPPLIER_PAYMENT'`;
  const where = clauses.length
    ? Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`
    : Prisma.empty;
  const sort =
    text("sortDirection") === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  return {
    ...page,
    query: Prisma.sql`WITH cash AS (${source}), filtered AS (SELECT * FROM cash ${where})
    SELECT *, count(*) OVER() AS total FROM filtered ORDER BY date ${sort}, id ${sort}
    LIMIT ${page.pageSize} OFFSET ${(page.page - 1) * page.pageSize}`,
  };
}

export async function listCashTransactions(
  params: Record<string, string | string[] | undefined>,
) {
  const { query, page, pageSize } = transactionQuery(params);
  const items =
    await getDatabase().$queryRaw<(CashTransaction & { total: bigint })[]>(
      query,
    );
  return { items, page, pageSize, total: Number(items[0]?.total ?? 0) };
}
