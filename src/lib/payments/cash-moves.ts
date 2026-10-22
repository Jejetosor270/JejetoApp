import "server-only";
import Decimal from "decimal.js";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { editVersion } from "@/lib/edit-version";
import { writeAuditEvent } from "@/lib/audit/events";
import { assertCreditSafeMutation } from "@/lib/credits/mutation-guards";
import { retainedCurrency } from "@/lib/related-records/context";
import { getOrderInTransaction } from "@/lib/procurement/orders";
import { billingIsIssued } from "@/domain/billing/status";
import {
  cashMoveSchema,
  type CashMoveInput,
  type CashMoveKind,
  type CashMoveOptions,
} from "@/domain/payments/cash-move";
import { PaymentValidationError } from "./errors";

const unavailable = "This cash record or destination is no longer available.";
const stale =
  "Cash or destination changed since opening. Your draft is retained; close and reopen to review the latest balances.";
const sum = (rows: { id: string; amount: Decimal.Value }[], exclude?: string) =>
  rows.reduce(
    (total, row) => (row.id === exclude ? total : total.plus(row.amount)),
    new Decimal(0),
  );

async function authorize(tx: Prisma.TransactionClient, actorId: string) {
  const actor = await tx.user.findUnique({
    where: { id: actorId },
    select: { isActive: true, role: true },
  });
  if (!actor?.isActive || !["ADMIN", "MANAGER"].includes(actor.role))
    throw new PaymentValidationError(
      "Only an active ADMIN or MANAGER can move cash.",
    );
}

type OrderCache = Map<string, ReturnType<typeof getOrderInTransaction>>;

async function supplierContext(
  tx: Prisma.TransactionClient,
  termId: string,
  cache?: OrderCache,
) {
  const term = await tx.paymentInstallment.findUnique({
    where: { id: termId },
    include: {
      settlements: true,
      order: {
        include: {
          project: true,
          paymentInstallments: { include: { settlements: true } },
        },
      },
    },
  });
  if (
    !term?.order ||
    term.direction !== "SUPPLIER_PAYMENT" ||
    !term.order.project
  )
    throw new PaymentValidationError(unavailable);
  const orderRead =
    cache?.get(term.order.id) ?? getOrderInTransaction(tx, term.order.id);
  cache?.set(term.order.id, orderRead);
  const order = await orderRead;
  if (!order) throw new PaymentValidationError(unavailable);
  return {
    term,
    order,
    parent: term.order,
    project: term.order.project,
    version: editVersion({ term, order }),
  };
}

async function clientContext(tx: Prisma.TransactionClient, documentId: string) {
  const document = await tx.clientBillingDocument.findUnique({
    where: { id: documentId },
    include: {
      project: true,
      receipts: true,
      paymentInstallments: {
        include: {
          receipts: true,
          matchedInvoices: {
            where: { isCancelled: false },
            select: { id: true },
          },
        },
      },
      matchedInstallment: {
        include: {
          receipts: true,
          matchedInvoices: {
            where: { isCancelled: false },
            select: { id: true },
          },
        },
      },
    },
  });
  if (!document?.project) throw new PaymentValidationError(unavailable);
  return {
    document,
    project: document.project,
    version: editVersion(document),
  };
}

function checkCurrency(
  currency: string,
  reporting: string,
  targetCurrency: string,
  targetReporting: string,
) {
  if (currency !== targetCurrency || reporting !== targetReporting)
    throw new PaymentValidationError(
      "Move cash only between matching transaction and reporting currencies. The recorded actual FX must keep its meaning.",
    );
}

async function loadSource(
  tx: Prisma.TransactionClient,
  kind: CashMoveKind,
  id: string,
) {
  if (kind === "SUPPLIER_PAYMENT") {
    const cash = await tx.paymentSettlement.findUnique({ where: { id } });
    if (!cash) throw new PaymentValidationError(unavailable);
    const context = await supplierContext(tx, cash.installmentId);
    return {
      kind,
      cash,
      context,
      version: editVersion({ cash, context }),
      currencyCode: context.term.currencyCode,
      reportingCurrencyCode: context.order.project.reportingCurrencyCode,
      projectId: context.order.project.id,
      label: `${context.order.orderNumber} · ${context.term.label}`,
    };
  }
  const cash = await tx.clientReceipt.findUnique({ where: { id } });
  if (!cash) throw new PaymentValidationError(unavailable);
  const context = await clientContext(tx, cash.billingDocumentId);
  const sourceTerm = cash.installmentId
    ? await tx.clientPaymentInstallment.findUnique({
        where: { id: cash.installmentId },
        include: {
          matchedInvoices: {
            where: { isCancelled: false },
            select: { id: true },
          },
        },
      })
    : null;
  if (
    (sourceTerm?.matchedInvoices.length ?? 0) > 1 ||
    (sourceTerm && sourceTerm.currencyCode !== context.document.currencyCode)
  )
    throw new PaymentValidationError(
      "Review the Invoice links and term currency before moving this receipt.",
    );
  return {
    kind,
    cash,
    context,
    version: editVersion({ cash, context, sourceTerm }),
    currencyCode: context.document.currencyCode,
    reportingCurrencyCode: context.project.reportingCurrencyCode,
    projectId: context.project.id,
    label: context.document.reference,
  };
}

function supplierRemaining(
  context: Awaited<ReturnType<typeof supplierContext>>,
  sourceId: string,
) {
  const { term, order } = context;
  if (
    term.isCancelled ||
    order.status === "CANCELLED" ||
    context.project.status === "ARCHIVED" ||
    order.supplierPayment.totalPayable === null
  )
    throw new PaymentValidationError(
      "Choose an active Order and payment term with a complete payable.",
    );
  const terms = context.parent.paymentInstallments.filter(
    (row) => row.direction === "SUPPLIER_PAYMENT",
  );
  if (
    term.currencyCode !== order.orderCurrencyCode ||
    terms.some((row) => row.currencyCode !== order.orderCurrencyCode)
  )
    throw new PaymentValidationError(
      "Review the Order's mixed-currency payment terms before moving cash.",
    );
  const termRemaining = new Decimal(term.scheduledAmount).minus(
    sum(term.settlements, sourceId),
  );
  const orderRemaining = new Decimal(order.supplierPayment.totalPayable).minus(
    sum(
      terms.flatMap((row) => row.settlements),
      sourceId,
    ),
  );
  return Decimal.min(termRemaining, orderRemaining);
}

function clientRemaining(
  context: Awaited<ReturnType<typeof clientContext>>,
  sourceId: string,
) {
  const { document } = context;
  if (
    document.documentType !== "INVOICE" ||
    !billingIsIssued(document) ||
    context.project.status === "ARCHIVED"
  )
    throw new PaymentValidationError("Choose an issued, active Invoice.");
  if (
    (document.matchedInstallment?.matchedInvoices.length ?? 0) > 1 ||
    (document.matchedInstallment &&
      document.matchedInstallment.currencyCode !== document.currencyCode) ||
    document.paymentInstallments.some((term) =>
      term.matchedInvoices.some((invoice) => invoice.id !== document.id),
    )
  )
    throw new PaymentValidationError(
      "Review the Invoice's matched payment terms before moving cash.",
    );
  const receipts = [
    ...new Map(
      [
        ...document.receipts,
        ...(document.matchedInstallment?.receipts ?? []),
      ].map((row) => [row.id, row]),
    ).values(),
  ];
  return new Decimal(document.totalTtc).minus(sum(receipts, sourceId));
}

/** Selector snapshots are read-only; every eligibility and balance check repeats at save. */
export async function cashMoveOptions(
  actorId: string,
  kind: CashMoveKind,
  id: string,
  projectId?: string,
  search = "",
): Promise<CashMoveOptions> {
  const db = getDatabase();
  await authorize(db, actorId);
  const source = await loadSource(db, kind, id);
  const selectedProject = projectId ?? source.projectId;
  const projects = await db.project.findMany({
    where: {
      status: { not: "ARCHIVED" },
      reportingCurrencyCode: source.reportingCurrencyCode,
    },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const targets: CashMoveOptions["targets"] = [];
  let limited = false;
  const matches = search
    ? { contains: search, mode: "insensitive" as const }
    : undefined;
  if (kind === "SUPPLIER_PAYMENT") {
    const terms = await db.paymentInstallment.findMany({
      where: {
        direction: "SUPPLIER_PAYMENT",
        isCancelled: false,
        currencyCode: source.currencyCode,
        order: { projectId: selectedProject, status: { not: "CANCELLED" } },
        ...(matches
          ? {
              OR: [
                { label: matches },
                {
                  order: {
                    OR: [
                      { orderNumber: matches },
                      { packageName: matches },
                      { shortDescription: matches },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
      select: { id: true },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: 101,
    });
    limited = terms.length > 100;
    const cache: OrderCache = new Map();
    const values = await boundedMap(terms.slice(0, 100), async (row) => {
      if (
        "installmentId" in source.cash &&
        source.cash.installmentId === row.id
      )
        return null;
      const context = await supplierContext(db, row.id, cache);
      try {
        const remaining = supplierRemaining(context, id);
        if (remaining.gte(source.cash.amount))
          return {
            id: row.id,
            label: `${context.order.orderNumber} · ${context.order.shortDescription ?? context.order.packageName} · ${context.term.label}`,
            remaining: remaining.toFixed(4),
            version: context.version,
          };
      } catch (error) {
        if (!(error instanceof PaymentValidationError)) throw error;
      }
      return null;
    });
    targets.push(...values.filter((row) => row !== null));
  } else {
    const documents = await db.clientBillingDocument.findMany({
      where: {
        projectId: selectedProject,
        documentType: "INVOICE",
        isCancelled: false,
        workflowStatus: { notIn: ["DRAFT", "TO_BE_INVOICED", "CANCELLED"] },
        currencyCode: source.currencyCode,
        ...(matches
          ? { OR: [{ reference: matches }, { shortDescription: matches }] }
          : {}),
      },
      select: { id: true },
      orderBy: [{ documentDate: "desc" }, { id: "asc" }],
      take: 101,
    });
    limited = documents.length > 100;
    const values = await boundedMap(documents.slice(0, 100), async (row) => {
      if (
        "billingDocumentId" in source.cash &&
        source.cash.billingDocumentId === row.id
      )
        return null;
      const context = await clientContext(db, row.id);
      try {
        const remaining = clientRemaining(context, id);
        if (remaining.gte(source.cash.amount))
          return {
            id: row.id,
            label: `${context.document.reference}${context.document.shortDescription ? ` · ${context.document.shortDescription}` : ""}`,
            remaining: remaining.toFixed(4),
            version: context.version,
          };
      } catch (error) {
        if (!(error instanceof PaymentValidationError)) throw error;
      }
      return null;
    });
    targets.push(...values.filter((row) => row !== null));
  }
  return {
    sourceVersion: source.version,
    sourceLabel: source.label,
    amount: source.cash.amount.toString(),
    currencyCode: source.currencyCode,
    projectId: selectedProject,
    search,
    limited,
    projects,
    targets,
  };
}

async function boundedMap<T, R>(
  rows: T[],
  read: (row: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < rows.length; index += 8) {
    results.push(
      ...(await Promise.all(rows.slice(index, index + 8).map(read))),
    );
  }
  return results;
}

export async function moveCash(actorId: string, raw: CashMoveInput) {
  const input = cashMoveSchema.parse(raw);
  return getDatabase().$transaction(
    async (tx) => {
      await authorize(tx, actorId);
      const source = await loadSource(tx, input.kind, input.id);
      if (source.version !== input.sourceVersion)
        throw new PaymentValidationError(stale);
      await assertCreditSafeMutation(
        tx,
        input.kind === "SUPPLIER_PAYMENT"
          ? "PaymentSettlement"
          : "ClientReceipt",
        [input.id],
      );
      let destinationProjectId: string;
      let destinationReference: string;
      if (input.kind === "SUPPLIER_PAYMENT") {
        const target = await supplierContext(tx, input.targetId);
        if (target.version !== input.targetVersion)
          throw new PaymentValidationError(stale);
        if (
          "installmentId" in source.cash &&
          source.cash.installmentId === target.term.id
        )
          throw new PaymentValidationError("Choose a different payment term.");
        checkCurrency(
          source.currencyCode,
          source.reportingCurrencyCode,
          target.term.currencyCode,
          target.order.project.reportingCurrencyCode,
        );
        await assertCreditSafeMutation(tx, "ProcurementOrder", [
          target.order.id,
        ]);
        if (supplierRemaining(target, input.id).lt(source.cash.amount))
          throw new PaymentValidationError(
            "This payment exceeds the destination balance.",
          );
        await tx.paymentSettlement.update({
          where: { id: input.id },
          data: { installmentId: target.term.id, updatedById: actorId },
        });
        destinationProjectId = target.order.project.id;
        destinationReference = `${target.order.orderNumber} · ${target.term.label}`;
      } else {
        const target = await clientContext(tx, input.targetId);
        if (target.version !== input.targetVersion)
          throw new PaymentValidationError(stale);
        if (
          "billingDocumentId" in source.cash &&
          source.cash.billingDocumentId === target.document.id
        )
          throw new PaymentValidationError(
            "Choose a different Invoice. Use Assign to term for this Invoice.",
          );
        checkCurrency(
          source.currencyCode,
          source.reportingCurrencyCode,
          target.document.currencyCode,
          retainedCurrency(
            target.document.project?.reportingCurrencyCode,
            target.document.detachedReportingCurrencyCode,
          ),
        );
        await assertCreditSafeMutation(tx, "ClientBillingDocument", [
          target.document.id,
        ]);
        if (clientRemaining(target, input.id).lt(source.cash.amount))
          throw new PaymentValidationError(
            "This receipt exceeds the destination Invoice balance.",
          );
        await tx.clientReceipt.update({
          where: { id: input.id },
          data: {
            billingDocumentId: target.document.id,
            installmentId: null,
            updatedById: actorId,
          },
        });
        destinationProjectId = target.project.id;
        destinationReference = target.document.reference;
      }
      await writeAuditEvent(tx, actorId, {
        action: "UPDATED",
        entityType:
          input.kind === "SUPPLIER_PAYMENT" ? "SETTLEMENT" : "CLIENT_RECEIPT",
        entityId: input.id,
        entityReference: destinationReference,
        summary:
          "Moved existing cash without changing its amount, date or actual FX.",
        metadata: {
          reason: input.reason,
          previous: { source: source.label, projectId: source.projectId },
          next: {
            targetId: input.targetId,
            reference: destinationReference,
            projectId: destinationProjectId,
          },
          amount: source.cash.amount.toString(),
          currency: source.currencyCode,
        },
      });
      return {
        projectIds: [...new Set([source.projectId, destinationProjectId])],
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
