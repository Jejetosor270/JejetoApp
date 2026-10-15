import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";
import {
  billingDocumentEditSchema,
  clientBillingConfirmationSchema,
} from "@/domain/billing/validation";

const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
import { billingDueDateContext, editBillingDueDate } from "./due-date";
import {
  confirmClientBillingDocument,
  getClientBillingDocument,
  updateClientBillingDocument,
} from "./billing";
import { listClientCashInstallments } from "./reporting";
import { changeBillingStatus } from "./status";
import { restoreTrash, trashInTransaction } from "@/lib/trash/service";

let memory: Awaited<ReturnType<typeof prismaMemoryDatabase>>;
let actorId: string, projectId: string, clientId: string;
let sequence = 0;
const migration = readFileSync(
  "prisma/migrations/20261015000000_payment_term_due_dates/migration.sql",
  "utf8",
);
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
beforeEach(async () => {
  memory = await prismaMemoryDatabase();
  state.db = memory.active;
  await memory.raw.currency.create({ data: { code: "EUR", name: "Euro" } });
  actorId = (
    await memory.raw.user.create({
      data: {
        name: "Reviewer",
        email: "dates@example.invalid",
        role: "MANAGER",
      },
    })
  ).id;
  clientId = (
    await memory.raw.client.create({
      data: {
        displayName: "Client",
        legalName: "Client",
        defaultCurrencyCode: "EUR",
      },
    })
  ).id;
  projectId = (
    await memory.raw.project.create({
      data: {
        code: "DATES",
        name: "Dates",
        clientId,
        reportingCurrencyCode: "EUR",
      },
    })
  ).id;
}, 30000);
afterEach(async () => {
  await memory.close();
});

const document = (
  overrides: Partial<Prisma.ClientBillingDocumentUncheckedCreateInput> = {},
) =>
  memory.raw.clientBillingDocument.create({
    data: {
      reference: `DATE-${++sequence}`,
      documentType: "INVOICE",
      workflowStatus: "INVOICED",
      documentDate: date("2026-10-01"),
      projectId,
      clientId,
      currencyCode: "EUR",
      totalHt: "100",
      totalTtc: "100",
      dueDate: date("2026-01-01"),
      ...overrides,
    },
  });
const term = (
  billingDocumentId: string,
  overrides: Partial<Prisma.ClientPaymentInstallmentUncheckedCreateInput> = {},
) =>
  memory.raw.clientPaymentInstallment.create({
    data: {
      billingDocumentId,
      sequence: 1,
      label: "Full amount",
      basis: "FIXED_AMOUNT",
      scheduledAmount: "100",
      currencyCode: "EUR",
      ...overrides,
    },
  });

it("clears the term date without resurrecting the historical document date or changing cash", async () => {
  const doc = await document();
  const paymentTerm = await term(doc.id, { dueDate: date("2026-01-02") });
  const receipt = await memory.raw.clientReceipt.create({
    data: {
      billingDocumentId: doc.id,
      installmentId: paymentTerm.id,
      amount: "20",
      receivedAt: date("2026-01-03"),
    },
  });
  await memory.active.$transaction((tx) =>
    editBillingDueDate(tx, actorId, doc.id, null),
  );
  expect(await getClientBillingDocument(doc.id)).toMatchObject({
    dueDate: null,
    paid: "20.0000",
    outstanding: "80.0000",
    status: "PARTIALLY_PAID",
  });
  expect((await listClientCashInstallments([projectId]))[0]).toMatchObject({
    dueDate: null,
    outstandingAmount: "80",
    receivedAmount: "20",
  });
  expect(
    (
      await memory.raw.clientBillingDocument.findUniqueOrThrow({
        where: { id: doc.id },
      })
    ).dueDate,
  ).toEqual(date("2026-01-01"));
  expect(
    await memory.raw.clientReceipt.findUniqueOrThrow({
      where: { id: receipt.id },
    }),
  ).toEqual(receipt);
});

it("preserves term dates when a general edit omits dueDate, and edits only the next dated split term", async () => {
  const doc = await document();
  const undated = await term(doc.id, { scheduledAmount: "40" });
  const dated = await term(doc.id, {
    sequence: 2,
    scheduledAmount: "60",
    dueDate: date("2099-02-01"),
  });
  const view = await getClientBillingDocument(doc.id);
  if (!view) throw new Error("Missing fixture");
  await updateClientBillingDocument(
    actorId,
    billingDocumentEditSchema.parse({
      ...view,
      reference: "EDITED",
      allocations: [],
      isProjectRemainderApproved: true,
      dueDate: undefined,
      vatTreatment: undefined,
      vatRate: undefined,
      fxRate: undefined,
      shortDescription: undefined,
      notes: undefined,
    }),
  );
  expect((await billingDueDateContext(memory.active, doc.id)).term?.id).toBe(
    dated.id,
  );
  await memory.active.$transaction((tx) =>
    editBillingDueDate(tx, actorId, doc.id, "2099-03-01"),
  );
  expect(
    (
      await memory.raw.clientPaymentInstallment.findUniqueOrThrow({
        where: { id: undated.id },
      })
    ).dueDate,
  ).toBeNull();
  expect(
    (
      await memory.raw.clientPaymentInstallment.findUniqueOrThrow({
        where: { id: dated.id },
      })
    ).dueDate,
  ).toEqual(date("2099-03-01"));
});

it("preserves a matched Quote term during re-import and confirms the actual invoice date atomically", async () => {
  const quote = await document({
    documentType: "QUOTE",
    workflowStatus: "TO_BE_INVOICED",
  });
  const matched = await term(quote.id, { dueDate: date("2099-04-01") });
  const invoice = await document({
    workflowStatus: "TO_BE_INVOICED",
    matchedInstallmentId: matched.id,
  });
  await confirmClientBillingDocument(
    actorId,
    clientBillingConfirmationSchema.parse({
      action: "UPDATE",
      existingDocumentId: invoice.id,
      allocations: [],
      clientId,
      projectId,
      currencyCode: "EUR",
      documentType: "INVOICE",
      documentDate: "2026-10-01",
      dueDate: "2026-01-05",
      reference: invoice.reference,
      totalHt: "100",
      totalTtc: "100",
      vatAmount: "0",
      installments: [],
      isCancelled: false,
      isProjectRemainderApproved: false,
      replaceSchedule: false,
      model: "reviewed",
      provider: "manual",
      originalFilename: "review.pdf",
      duplicateWarning: false,
    }),
  );
  expect(
    (
      await memory.raw.clientBillingDocument.findUniqueOrThrow({
        where: { id: invoice.id },
      })
    ).matchedInstallmentId,
  ).toBe(matched.id);
  expect((await getClientBillingDocument(invoice.id))?.dueDate).toBe(
    "2099-04-01",
  );
  await changeBillingStatus(actorId, {
    id: invoice.id,
    value: "INVOICED",
    documentDate: "2026-10-12",
  });
  expect(await getClientBillingDocument(invoice.id)).toMatchObject({
    documentDate: "2026-10-12",
    status: "INVOICED",
    dueDate: "2099-04-01",
  });
  expect(await memory.raw.clientReceipt.count()).toBe(0);
  expect(
    await memory.raw.clientPaymentInstallment.count({
      where: { billingDocumentId: invoice.id },
    }),
  ).toBe(0);
});

it("backfills only inherited dates, retains direct cash and registers new trashed terms for restoration", async () => {
  const legacy = await document();
  const paid = await document();
  const direct = await memory.raw.clientReceipt.create({
    data: {
      billingDocumentId: legacy.id,
      amount: "40",
      receivedAt: date("2026-01-02"),
    },
  });
  await memory.raw.clientReceipt.create({
    data: {
      billingDocumentId: paid.id,
      amount: "100",
      receivedAt: date("2026-01-02"),
    },
  });
  const explicitDoc = await document();
  const explicit = await term(explicitDoc.id, { dueDate: date("2099-06-01") });
  const quote = await document({
    documentType: "QUOTE",
    workflowStatus: "TO_BE_INVOICED",
  });
  const matched = await term(quote.id);
  const matchedInvoice = await document({ matchedInstallmentId: matched.id });
  const matchedBatch = await memory.active.$transaction((tx) =>
    trashInTransaction(tx, actorId, "ClientBillingDocument", [
      matchedInvoice.id,
    ]),
  );
  const originalDependency = await memory.raw.trashDependency.findFirstOrThrow({
    where: {
      batchId: matchedBatch,
      model: "ClientPaymentInstallment",
      recordId: matched.id,
    },
  });
  const unrelatedBatch = await memory.raw.trashBatch.create({
    data: { label: "Unrelated prior edit" },
  });
  const staleDependency = await memory.raw.trashDependency.create({
    data: {
      batchId: unrelatedBatch.id,
      model: "ClientPaymentInstallment",
      recordId: matched.id,
      signature: "00000000000000000000000000000000",
    },
  });
  const credited = await document();
  await memory.raw.clientReceipt.create({
    data: {
      billingDocumentId: credited.id,
      amount: "40",
      receivedAt: date("2026-01-02"),
    },
  });
  await memory.raw.financialCredit.create({
    data: {
      side: "CLIENT",
      billingDocumentId: credited.id,
      reference: "CREDIT",
      creditDate: date("2026-02-01"),
      reason: "Correction",
      totalHt: "20",
      vatAmount: "0",
      currencyCode: "EUR",
      reportingCurrencyCode: "EUR",
    },
  });
  const trashed = await document({ trashedAt: date("2026-10-01") });
  const batch = await memory.raw.trashBatch.create({
    data: {
      label: "Billing",
      records: {
        create: { model: "ClientBillingDocument", recordId: trashed.id },
      },
    },
  });
  await memory.pg.exec(migration);
  expect(
    (
      await memory.raw.clientPaymentInstallment.findUniqueOrThrow({
        where: { id: explicit.id },
      })
    ).dueDate,
  ).toEqual(date("2099-06-01"));
  expect(
    (
      await memory.raw.clientPaymentInstallment.findUniqueOrThrow({
        where: { id: matched.id },
      })
    ).dueDate,
  ).toEqual(date("2026-01-01"));
  expect(
    (
      await memory.raw.trashDependency.findUniqueOrThrow({
        where: { id: originalDependency.id },
      })
    ).signature,
  ).not.toBe(originalDependency.signature);
  expect(
    (
      await memory.raw.trashDependency.findUniqueOrThrow({
        where: { id: staleDependency.id },
      })
    ).signature,
  ).toBe(staleDependency.signature);
  await restoreTrash(actorId, matchedBatch);
  expect((await getClientBillingDocument(matchedInvoice.id))?.dueDate).toBe(
    "2026-01-01",
  );
  expect(
    (
      await memory.raw.clientPaymentInstallment.findFirstOrThrow({
        where: { billingDocumentId: credited.id },
      })
    ).scheduledAmount.toString(),
  ).toBe("40");
  expect(
    (await listClientCashInstallments([projectId])).find(
      (row) => row.billingDocumentId === legacy.id,
    ),
  ).toMatchObject({ dueDate: "2026-01-01", outstandingAmount: "60" });
  expect(
    (await listClientCashInstallments([projectId])).find(
      (row) => row.billingDocumentId === paid.id,
    ),
  ).toBeUndefined();
  expect(
    await memory.raw.clientPaymentInstallment.count({
      where: { billingDocumentId: paid.id },
    }),
  ).toBe(0);
  expect(
    await memory.raw.clientPaymentInstallment.findFirstOrThrow({
      where: { billingDocumentId: legacy.id },
    }),
  ).toMatchObject({
    basis: "FIXED_AMOUNT",
    percentageRate: null,
    label: "Remaining balance",
  });
  expect(await getClientBillingDocument(paid.id)).toMatchObject({
    status: "PAID",
    dueDate: null,
    paidAt: "2026-01-02",
  });
  expect(
    await memory.raw.clientReceipt.findUniqueOrThrow({
      where: { id: direct.id },
    }),
  ).toEqual(direct);
  const hidden = await memory.raw.clientPaymentInstallment.findFirstOrThrow({
    where: { billingDocumentId: trashed.id },
  });
  expect(hidden.trashedAt).toEqual(trashed.trashedAt);
  expect(
    await memory.raw.trashRecord.count({
      where: {
        batchId: batch.id,
        model: "ClientPaymentInstallment",
        recordId: hidden.id,
      },
    }),
  ).toBe(1);
  await restoreTrash(actorId, batch.id);
  expect(
    (
      await memory.active.clientPaymentInstallment.findUniqueOrThrow({
        where: { id: hidden.id },
      })
    ).dueDate,
  ).toEqual(date("2026-01-01"));
});

it("refuses conflicting matched fallback dates without partially backfilling or exposing records", async () => {
  const quote = await document({
    documentType: "QUOTE",
    workflowStatus: "TO_BE_INVOICED",
  });
  const matched = await term(quote.id);
  await document({
    matchedInstallmentId: matched.id,
    dueDate: date("2026-02-01"),
  });
  await expect(memory.pg.exec(migration)).rejects.toThrow(
    "1 shared payment terms have conflicting legacy dates",
  );
  await memory.pg.exec("ROLLBACK");
  expect(
    (
      await memory.raw.clientPaymentInstallment.findUniqueOrThrow({
        where: { id: matched.id },
      })
    ).dueDate,
  ).toBeNull();
  expect(await memory.raw.clientPaymentInstallment.count()).toBe(1);
});

it("rejects invalid issue dates without changing document state or payment terms", async () => {
  const doc = await document({ workflowStatus: "TO_BE_INVOICED" });
  const paymentTerm = await term(doc.id, { dueDate: date("2099-01-02") });
  await expect(
    changeBillingStatus(actorId, {
      id: doc.id,
      value: "INVOICED",
      documentDate: "2026-02-30",
    }),
  ).rejects.toThrow("valid Invoice date");
  expect(
    (
      await memory.raw.clientBillingDocument.findUniqueOrThrow({
        where: { id: doc.id },
      })
    ).workflowStatus,
  ).toBe("TO_BE_INVOICED");
  expect(
    await memory.raw.clientPaymentInstallment.findUniqueOrThrow({
      where: { id: paymentTerm.id },
    }),
  ).toEqual(paymentTerm);
});
