import "server-only";
import Decimal from "decimal.js";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { requireMasterDataEditor, requireUser } from "@/lib/auth/current-user";
import { writeAuditEvent } from "@/lib/audit/events";
import {
  dateOnlyToDate,
  dateToDateOnly,
  isDateOnly,
} from "@/domain/payments/dates";
import {
  bankImportSchema,
  cashKinds,
  matchSchema,
  unmatchSchema,
  validateMatch,
  ReconciliationError,
  type CashKind,
} from "@/domain/reconciliation/schema";
import { fingerprint, readReconciliationCash } from "./cash";

const idSchema = z.uuid();
const cashKey = (kind: string, id: string) => `${kind}:${id}`;
const cashKind = (value: string): CashKind | null =>
  cashKinds.find((kind) => kind === value) ?? null;

export async function saveBankImport(raw: unknown) {
  const actor = await requireMasterDataEditor();
  const input = bankImportSchema.parse(raw);
  const lines = input.lines.map((line) => ({
    ...line,
    amount: new Decimal(line.amount).toFixed(),
  }));
  const accountKey = input.accountLabel.normalize("NFKC").trim().toLowerCase();
  const digest = fingerprint(lines);
  const db = getDatabase();
  if (!(await db.currency.findUnique({ where: { code: input.currencyCode } })))
    throw new ReconciliationError("Choose an existing currency.");
  const where = {
    accountKey_currencyCode_fingerprint: {
      accountKey,
      currencyCode: input.currencyCode,
      fingerprint: digest,
    },
  };
  const existing = await db.bankStatementImport.findUnique({ where });
  if (existing) return { id: existing.id, duplicate: true };
  try {
    return await db.$transaction(async (tx) => {
      const created = await tx.bankStatementImport.create({
        data: {
          accountLabel: input.accountLabel,
          accountKey,
          currencyCode: input.currencyCode,
          fingerprint: digest,
          createdById: actor.id,
          lines: {
            create: lines.map((line) => ({
              ...line,
              bookedAt: dateOnlyToDate(line.bookedAt),
              reference: line.reference || null,
              description: line.description || null,
              bankTransactionId: line.bankTransactionId || null,
            })),
          },
        },
      });
      await writeAuditEvent(tx, actor.id, {
        action: "IMPORTED",
        entityType: "BANK_RECONCILIATION",
        entityId: created.id,
        entityReference: input.accountLabel,
        summary:
          "Imported reviewed bank lines for matching existing cash only.",
        metadata: { rowCount: lines.length, currencyCode: input.currencyCode },
      });
      return { id: created.id, duplicate: false };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const duplicate = await db.bankStatementImport.findUnique({ where });
      if (duplicate) return { id: duplicate.id, duplicate: true };
    }
    throw error;
  }
}

export async function confirmBankMatch(raw: unknown): Promise<void> {
  const actor = await requireMasterDataEditor();
  const input = matchSchema.parse(raw);
  await getDatabase().$transaction(
    async (tx) => {
      const line = await tx.bankStatementLine.findUnique({
        where: { id: input.lineId },
        include: { statementImport: true, matches: true },
      });
      if (
        !line ||
        line.updatedAt.toISOString() !== input.version ||
        line.matches.length
      )
        throw new ReconciliationError(
          "This bank row changed or is already matched. Reload it before confirming.",
        );
      const cash = await readReconciliationCash(tx, { ids: input.selections });
      const current = new Map(
        cash.map((row) => [cashKey(row.kind, row.id), row]),
      );
      if (
        input.selections.some(
          (selection) =>
            current.get(cashKey(selection.kind, selection.id))?.fingerprint !==
            selection.fingerprint,
        )
      )
        throw new ReconciliationError(
          "Selected cash changed, was removed, or is no longer eligible. Search again; your selection has not been saved.",
        );
      validateMatch(
        {
          amount: line.amount.toString(),
          direction: line.direction,
          currencyCode: line.statementImport.currencyCode,
        },
        cash,
      );
      const reserved = await tx.bankReconciliationMatch.count({
        where: {
          OR: input.selections.map((row) => ({
            cashKind: row.kind,
            cashRecordId: row.id,
          })),
        },
      });
      if (reserved)
        throw new ReconciliationError(
          "A selected cash record is already linked to another bank row. Unmatch it first.",
        );
      await tx.bankReconciliationMatch.createMany({
        data: input.selections.map((row) => ({
          lineId: line.id,
          cashKind: row.kind,
          cashRecordId: row.id,
          cashFingerprint: row.fingerprint,
          createdById: actor.id,
        })),
      });
      await tx.bankStatementLine.update({
        where: { id: line.id },
        data: { updatedAt: new Date() },
      });
      await writeAuditEvent(tx, actor.id, {
        action: "UPDATED",
        entityType: "BANK_RECONCILIATION",
        entityId: line.id,
        entityReference: line.statementImport.accountLabel,
        summary:
          "Confirmed bank match to existing cash; no payment or receipt created.",
        metadata: {
          importId: line.importId,
          matches: input.selections.map((row) => ({
            kind: row.kind,
            id: row.id,
          })),
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function unmatchBankLine(raw: unknown): Promise<void> {
  const actor = await requireMasterDataEditor();
  const input = unmatchSchema.parse(raw);
  await getDatabase().$transaction(
    async (tx) => {
      const line = await tx.bankStatementLine.findUnique({
        where: { id: input.lineId },
        include: { statementImport: true, matches: true },
      });
      if (!line || line.updatedAt.toISOString() !== input.version)
        throw new ReconciliationError(
          "This row changed. Reload before removing its match.",
        );
      await tx.bankReconciliationMatch.deleteMany({
        where: { lineId: line.id },
      });
      await tx.bankStatementLine.update({
        where: { id: line.id },
        data: { updatedAt: new Date() },
      });
      await writeAuditEvent(tx, actor.id, {
        action: "UPDATED",
        entityType: "BANK_RECONCILIATION",
        entityId: line.id,
        entityReference: line.statementImport.accountLabel,
        summary:
          "Removed bank matching links; existing cash records are unchanged.",
        metadata: {
          previousMatches: line.matches.map((row) => ({
            kind: row.cashKind,
            id: row.cashRecordId,
          })),
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function listBankImports() {
  await requireUser();
  return getDatabase().bankStatementImport.findMany({
    take: 50,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      accountLabel: true,
      currencyCode: true,
      createdAt: true,
      _count: { select: { lines: true } },
    },
  });
}

export async function getBankImport(rawId: string, page = 1) {
  await requireUser();
  const id = idSchema.parse(rawId);
  const currentPage = z.number().int().min(1).max(100000).parse(page);
  const db = getDatabase();
  const statement = await db.bankStatementImport.findUnique({
    where: { id },
    include: {
      _count: { select: { lines: true } },
      lines: {
        take: 30,
        skip: (currentPage - 1) * 30,
        orderBy: { rowNumber: "asc" },
        include: { matches: true },
      },
    },
  });
  if (!statement) return null;
  const ids = statement.lines.flatMap((line) =>
    line.matches.flatMap((match) => {
      const kind = cashKind(match.cashKind);
      return kind ? [{ kind, id: match.cashRecordId }] : [];
    }),
  );
  // Each line permits up to 100 cash links, so read in bounded batches.
  const cash = [];
  for (let offset = 0; offset < ids.length; offset += 100)
    cash.push(
      ...(await readReconciliationCash(db, {
        ids: ids.slice(offset, offset + 100),
      })),
    );
  const byId = new Map(cash.map((row) => [cashKey(row.kind, row.id), row]));
  return {
    id: statement.id,
    accountLabel: statement.accountLabel,
    currencyCode: statement.currencyCode,
    total: statement._count.lines,
    lines: await Promise.all(
      statement.lines.map(async (line) => {
        const related = line.matches.map((match) => ({
          kind: match.cashKind,
          id: match.cashRecordId,
          cash: byId.get(cashKey(match.cashKind, match.cashRecordId)) ?? null,
          fingerprint: match.cashFingerprint,
        }));
        let status: "UNMATCHED" | "MATCHED" | "NEEDS_REVIEW" = related.length
          ? "MATCHED"
          : "UNMATCHED";
        if (
          related.some(
            (row) => !row.cash || row.cash.fingerprint !== row.fingerprint,
          )
        )
          status = "NEEDS_REVIEW";
        const duplicates = await db.bankStatementLine.count({
          where: {
            importId: { not: id },
            statementImport: {
              accountKey: statement.accountKey,
              currencyCode: statement.currencyCode,
            },
            ...(line.bankTransactionId
              ? { bankTransactionId: line.bankTransactionId }
              : {
                  bookedAt: line.bookedAt,
                  amount: line.amount,
                  direction: line.direction,
                  reference: line.reference,
                }),
          },
        });
        return {
          id: line.id,
          version: line.updatedAt.toISOString(),
          rowNumber: line.rowNumber,
          bookedAt: dateToDateOnly(line.bookedAt),
          amount: line.amount.toString(),
          direction: line.direction,
          reference: line.reference ?? "",
          description: line.description ?? "",
          status,
          possibleDuplicate: duplicates > 0,
          matches: related.map((row) => ({
            kind: row.kind,
            id: row.id,
            cash: row.cash,
          })),
        };
      }),
    ),
  };
}

const searchSchema = z
  .object({
    lineId: z.uuid(),
    dateFrom: z.string().refine(isDateOnly),
    dateTo: z.string().refine(isDateOnly),
    query: z.string().trim().max(120).default(""),
  })
  .strict()
  .refine(
    (value) => value.dateFrom <= value.dateTo,
    "The end date must follow the start date.",
  );
export async function searchBankCandidates(raw: unknown) {
  await requireUser();
  const input = searchSchema.parse(raw);
  const db = getDatabase();
  const line = await db.bankStatementLine.findUnique({
    where: { id: input.lineId },
    include: { statementImport: true },
  });
  if (!line) throw new ReconciliationError("Bank row not found.");
  const candidates = await readReconciliationCash(db, {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    query: input.query,
    currencyCode: line.statementImport.currencyCode,
    direction: line.direction,
  });
  const reserved = await db.bankReconciliationMatch.findMany({
    where: {
      OR: candidates.map((row) => ({
        cashKind: row.kind,
        cashRecordId: row.id,
      })),
    },
    select: { cashKind: true, cashRecordId: true },
  });
  const used = new Set(
    reserved.map((row) => cashKey(row.cashKind, row.cashRecordId)),
  );
  const available = candidates.filter(
    (row) =>
      !used.has(cashKey(row.kind, row.id)) &&
      new Decimal(row.amount).lessThanOrEqualTo(line.amount),
  );
  available.sort((left, right) => {
    const score = (row: typeof left) =>
      (new Decimal(row.amount).equals(line.amount) ? 2 : 0) +
      (line.reference &&
      row.reference.toLowerCase() === line.reference.toLowerCase()
        ? 1
        : 0);
    return (
      score(right) - score(left) ||
      left.date.localeCompare(right.date) ||
      left.id.localeCompare(right.id)
    );
  });
  return {
    candidates: available.slice(0, 100),
    limited: candidates.length >= 101 || available.length > 100,
  };
}

export type BankImportView = NonNullable<
  Awaited<ReturnType<typeof getBankImport>>
>;
