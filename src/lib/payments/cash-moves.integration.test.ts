import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";
const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
import { cashMoveOptions, moveCash } from "./cash-moves";
import { readReconciliationCash } from "@/lib/reconciliation/cash";
import type { CashMoveKind } from "@/domain/payments/cash-move";

let memory: Awaited<ReturnType<typeof prismaMemoryDatabase>>;
let actorId: string;
let sequence = 0;
beforeAll(async () => {
  memory = await prismaMemoryDatabase();
  state.db = memory.active;
  await memory.raw.currency.createMany({
    data: [
      { code: "EUR", name: "Euro" },
      { code: "USD", name: "Dollar" },
    ],
  });
  actorId = (
    await memory.raw.user.create({
      data: { name: "Manager", email: "moves@example.test", role: "MANAGER" },
    })
  ).id;
}, 30000);
afterAll(async () => memory?.close());

async function fixture() {
  const index = ++sequence;
  const project = await memory.raw.project.create({
    data: {
      code: `MOVE-${index}`,
      name: "Cash moves",
      reportingCurrencyCode: "EUR",
    },
  });
  const orders = await Promise.all(
    [1, 2].map((side) =>
      memory.raw.procurementOrder.create({
        data: {
          projectId: project.id,
          orderNumber: `MOVE-${index}-${side}`,
          packageName: "Furniture",
          orderCurrencyCode: "EUR",
          sellingCurrencyCode: "EUR",
          pricingMode: "DIRECT_SELLING_PRICE",
          sellingPriceAmount: "150",
          costLines: {
            create: { category: "SUPPLIER_PURCHASE", originalAmount: "120" },
          },
          paymentInstallments: {
            create: {
              direction: "SUPPLIER_PAYMENT",
              sequence: 1,
              label: "Balance",
              basis: "FIXED_AMOUNT",
              scheduledAmount: "120",
              currencyCode: "EUR",
            },
          },
        },
        include: { paymentInstallments: true },
      }),
    ),
  );
  const invoices = await Promise.all(
    [1, 2].map((side) =>
      memory.raw.clientBillingDocument.create({
        data: {
          projectId: project.id,
          documentType: "INVOICE",
          reference: `MOVE-INV-${index}-${side}`,
          documentDate: new Date("2026-10-01"),
          currencyCode: "EUR",
          workflowStatus: "INVOICED",
          totalHt: "100",
          vatAmount: "20",
          totalTtc: "120",
          paymentInstallments: {
            create: {
              sequence: 1,
              label: "Balance",
              basis: "FIXED_AMOUNT",
              scheduledAmount: "120",
              currencyCode: "EUR",
            },
          },
        },
        include: { paymentInstallments: true },
      }),
    ),
  );
  const sourceOrder = orders[0]!;
  const targetOrder = orders[1]!;
  const sourceInvoice = invoices[0]!;
  const targetInvoice = invoices[1]!;
  const payment = await memory.raw.paymentSettlement.create({
    data: {
      installmentId: sourceOrder.paymentInstallments[0]!.id,
      amount: "40.1234",
      settledAt: new Date("2026-10-02"),
      reference: "Supplier transfer",
      notes: "Original note",
      createdById: actorId,
    },
  });
  const receipt = await memory.raw.clientReceipt.create({
    data: {
      billingDocumentId: sourceInvoice.id,
      installmentId: sourceInvoice.paymentInstallments[0]!.id,
      amount: "40.1234",
      receivedAt: new Date("2026-10-02"),
      reference: "Client transfer",
      notes: "Original note",
      createdById: actorId,
    },
  });
  return {
    project,
    sourceOrder,
    targetOrder,
    sourceInvoice,
    targetInvoice,
    payment,
    receipt,
  };
}

async function input(
  kind: CashMoveKind,
  id: string,
  targetId: string,
  projectId?: string,
) {
  const options = await cashMoveOptions(actorId, kind, id, projectId);
  const target = options.targets.find((row) => row.id === targetId);
  expect(target).toBeDefined();
  return {
    kind,
    id,
    targetId,
    sourceVersion: options.sourceVersion,
    targetVersion: target!.version,
    reason: "Correct wrong assignment",
    confirmed: "yes" as const,
  };
}

it("moves the same Supplier payment, preserves its cash history, and invalidates its bank fingerprint", async () => {
  const { payment, targetOrder, sourceOrder } = await fixture();
  const before = (
    await readReconciliationCash(memory.active, {
      ids: [{ kind: "SUPPLIER_PAYMENT", id: payment.id }],
    })
  )[0]!;
  const targetId = targetOrder.paymentInstallments[0]!.id;
  await moveCash(
    actorId,
    await input("SUPPLIER_PAYMENT", payment.id, targetId),
  );
  const saved = await memory.raw.paymentSettlement.findUniqueOrThrow({
    where: { id: payment.id },
  });
  expect(saved).toMatchObject({
    id: payment.id,
    installmentId: targetId,
    amount: payment.amount,
    settledAt: payment.settledAt,
    fxRateToReporting: payment.fxRateToReporting,
    reference: payment.reference,
    notes: payment.notes,
    createdAt: payment.createdAt,
    createdById: payment.createdById,
  });
  expect(
    await memory.raw.paymentSettlement.count({
      where: { installmentId: sourceOrder.paymentInstallments[0]!.id },
    }),
  ).toBe(0);
  expect(
    await memory.raw.paymentSettlement.count({
      where: { installmentId: targetId },
    }),
  ).toBe(1);
  const after = (
    await readReconciliationCash(memory.active, {
      ids: [{ kind: "SUPPLIER_PAYMENT", id: payment.id }],
    })
  )[0]!;
  expect(after.fingerprint).not.toBe(before.fingerprint);
  expect(after.amount).toBe(before.amount);
  expect(
    await memory.raw.auditEvent.count({
      where: { entityId: payment.id, action: "UPDATED" },
    }),
  ).toBe(1);
});

it("moves receipts to Invoice level without new cash or a duplicated old term assignment", async () => {
  const { receipt, sourceInvoice, targetInvoice } = await fixture();
  await moveCash(
    actorId,
    await input("CLIENT_RECEIPT", receipt.id, targetInvoice.id),
  );
  const saved = await memory.raw.clientReceipt.findUniqueOrThrow({
    where: { id: receipt.id },
  });
  expect(saved).toMatchObject({
    id: receipt.id,
    billingDocumentId: targetInvoice.id,
    installmentId: null,
    amount: receipt.amount,
    receivedAt: receipt.receivedAt,
    reference: receipt.reference,
    notes: receipt.notes,
    createdAt: receipt.createdAt,
    createdById: receipt.createdById,
  });
  expect(
    await memory.raw.clientReceipt.count({
      where: { billingDocumentId: sourceInvoice.id },
    }),
  ).toBe(0);
  expect(
    await memory.raw.clientReceipt.count({
      where: { billingDocumentId: targetInvoice.id },
    }),
  ).toBe(1);
});

it("rejects stale source and target snapshots, preserves original cash and prevents replay", async () => {
  const { receipt, targetInvoice } = await fixture();
  const first = await input("CLIENT_RECEIPT", receipt.id, targetInvoice.id);
  await memory.raw.clientReceipt.update({
    where: { id: receipt.id },
    data: { reference: "Edited meanwhile" },
  });
  await expect(moveCash(actorId, first)).rejects.toThrow(
    "changed since opening",
  );
  const second = await input("CLIENT_RECEIPT", receipt.id, targetInvoice.id);
  await memory.raw.clientReceipt.create({
    data: {
      billingDocumentId: targetInvoice.id,
      amount: "90",
      receivedAt: new Date("2026-10-03"),
    },
  });
  await expect(moveCash(actorId, second)).rejects.toThrow(
    "changed since opening",
  );
  expect(
    (
      await memory.raw.clientReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
      })
    ).billingDocumentId,
  ).not.toBe(targetInvoice.id);
});

it("keeps foreign actual FX unchanged across Projects with the same reporting currency", async () => {
  const { receipt, sourceInvoice, targetInvoice, project } = await fixture();
  for (const bill of [sourceInvoice, targetInvoice]) {
    await memory.raw.clientBillingDocument.update({
      where: { id: bill.id },
      data: { currencyCode: "USD" },
    });
    await memory.raw.clientPaymentInstallment.updateMany({
      where: { billingDocumentId: bill.id },
      data: { currencyCode: "USD" },
    });
  }
  await memory.raw.clientReceipt.update({
    where: { id: receipt.id },
    data: { fxRateToReporting: "0.9123456789" },
  });
  const other = await memory.raw.project.create({
    data: {
      name: "Other project",
      code: `OTHER-${sequence}`,
      reportingCurrencyCode: "EUR",
    },
  });
  await memory.raw.clientBillingDocument.update({
    where: { id: targetInvoice.id },
    data: { projectId: other.id },
  });
  const result = await moveCash(
    actorId,
    await input("CLIENT_RECEIPT", receipt.id, targetInvoice.id, other.id),
  );
  expect(result.projectIds).toEqual([project.id, other.id]);
  expect(
    (
      await memory.raw.clientReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
      })
    ).fxRateToReporting?.toString(),
  ).toBe("0.9123456789");
});

it("excludes cancelled, overpaid, currency-incompatible and unissued targets", async () => {
  const { receipt, payment, targetInvoice, targetOrder } = await fixture();
  await memory.raw.clientBillingDocument.update({
    where: { id: targetInvoice.id },
    data: { workflowStatus: "TO_BE_INVOICED" },
  });
  expect(
    (await cashMoveOptions(actorId, "CLIENT_RECEIPT", receipt.id)).targets,
  ).toEqual([]);
  await memory.raw.clientBillingDocument.update({
    where: { id: targetInvoice.id },
    data: { workflowStatus: "INVOICED", currencyCode: "USD" },
  });
  expect(
    (await cashMoveOptions(actorId, "CLIENT_RECEIPT", receipt.id)).targets,
  ).toEqual([]);
  await memory.raw.paymentInstallment.update({
    where: { id: targetOrder.paymentInstallments[0]!.id },
    data: { scheduledAmount: "20" },
  });
  expect(
    (await cashMoveOptions(actorId, "SUPPLIER_PAYMENT", payment.id)).targets,
  ).toEqual([]);
  await memory.raw.paymentInstallment.update({
    where: { id: targetOrder.paymentInstallments[0]!.id },
    data: { scheduledAmount: "120", isCancelled: true },
  });
  expect(
    (await cashMoveOptions(actorId, "SUPPLIER_PAYMENT", payment.id)).targets,
  ).toEqual([]);
});

it("rejects USER actors and missing explicit confirmation", async () => {
  const { receipt, targetInvoice } = await fixture();
  const data = await input("CLIENT_RECEIPT", receipt.id, targetInvoice.id);
  const user = await memory.raw.user.create({
    data: {
      name: "Reader",
      email: `reader-${sequence}@example.test`,
      role: "USER",
    },
  });
  await expect(moveCash(user.id, data)).rejects.toThrow("ADMIN or MANAGER");
  await expect(
    moveCash(actorId, { ...data, confirmed: "" as "yes" }),
  ).rejects.toThrow();
});

it("blocks moves into a credited Invoice without changing the receipt", async () => {
  const { receipt, targetInvoice } = await fixture();
  const data = await input("CLIENT_RECEIPT", receipt.id, targetInvoice.id);
  await memory.raw.financialCredit.create({
    data: {
      side: "CLIENT",
      billingDocumentId: targetInvoice.id,
      reference: `CR-${sequence}`,
      creditDate: new Date("2026-10-03"),
      reason: "Reviewed correction",
      totalHt: "10",
      vatAmount: "0",
      currencyCode: "EUR",
      reportingCurrencyCode: "EUR",
    },
  });
  await expect(moveCash(actorId, data)).rejects.toThrow("credits");
  expect(
    (
      await memory.raw.clientReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
      })
    ).billingDocumentId,
  ).toBe(receipt.billingDocumentId);
});

it("protects the credited matched Invoice when moving a Quote receipt", async () => {
  const { receipt, sourceInvoice, targetInvoice, project } = await fixture();
  await memory.raw.clientBillingDocument.update({
    where: { id: sourceInvoice.id },
    data: { documentType: "QUOTE" },
  });
  const matchingInvoice = await memory.raw.clientBillingDocument.create({
    data: {
      projectId: project.id,
      documentType: "INVOICE",
      reference: `MATCHED-${sequence}`,
      documentDate: new Date("2026-10-03"),
      workflowStatus: "INVOICED",
      currencyCode: "EUR",
      totalHt: "100",
      vatAmount: "20",
      totalTtc: "120",
      matchedInstallmentId: sourceInvoice.paymentInstallments[0]!.id,
    },
  });
  await memory.raw.financialCredit.create({
    data: {
      side: "CLIENT",
      billingDocumentId: matchingInvoice.id,
      reference: `MATCH-CR-${sequence}`,
      creditDate: new Date("2026-10-03"),
      reason: "Reviewed correction",
      totalHt: "10",
      vatAmount: "0",
      currencyCode: "EUR",
      reportingCurrencyCode: "EUR",
    },
  });
  await expect(
    moveCash(
      actorId,
      await input("CLIENT_RECEIPT", receipt.id, targetInvoice.id),
    ),
  ).rejects.toThrow("credits");
  expect(
    (
      await memory.raw.clientReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
      })
    ).installmentId,
  ).toBe(receipt.installmentId);
});

it("rejects source-term currency ambiguity and a newly trashed destination", async () => {
  const { receipt, sourceInvoice, targetInvoice } = await fixture();
  await memory.raw.clientPaymentInstallment.update({
    where: { id: sourceInvoice.paymentInstallments[0]!.id },
    data: { currencyCode: "USD" },
  });
  await expect(
    cashMoveOptions(actorId, "CLIENT_RECEIPT", receipt.id),
  ).rejects.toThrow("term currency");
  await memory.raw.clientPaymentInstallment.update({
    where: { id: sourceInvoice.paymentInstallments[0]!.id },
    data: { currencyCode: "EUR" },
  });
  const data = await input("CLIENT_RECEIPT", receipt.id, targetInvoice.id);
  await memory.raw.clientBillingDocument.update({
    where: { id: targetInvoice.id },
    data: { trashedAt: new Date() },
  });
  await expect(moveCash(actorId, data)).rejects.toThrow("no longer available");
});

it("rejects a changed reporting-currency context instead of reinterpreting actual FX", async () => {
  const { receipt, targetInvoice, project } = await fixture();
  const other = await memory.raw.project.create({
    data: {
      code: `FX-MOVE-${sequence}`,
      name: "Different reporting currency",
      reportingCurrencyCode: "USD",
    },
  });
  await memory.raw.clientBillingDocument.update({
    where: { id: targetInvoice.id },
    data: { projectId: other.id },
  });
  const data = await input(
    "CLIENT_RECEIPT",
    receipt.id,
    targetInvoice.id,
    other.id,
  );
  await expect(moveCash(actorId, data)).rejects.toThrow(
    "matching transaction and reporting currencies",
  );
  expect(
    (
      await memory.raw.clientBillingDocument.findUniqueOrThrow({
        where: { id: receipt.billingDocumentId },
      })
    ).projectId,
  ).toBe(project.id);
});
