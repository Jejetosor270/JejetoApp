import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";

const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
import {
  deleteSettlementInTransaction,
  recordSettlementInTransaction,
  updateSettlementInTransaction,
} from "./payments";
import {
  deleteClientReceiptInTransaction,
  recordClientReceiptInTransaction,
  updateClientReceiptInTransaction,
} from "@/lib/billing/billing";
import { cashEditVersion } from "./edit-version";

let memory: Awaited<ReturnType<typeof prismaMemoryDatabase>>;
let actorId: string;
let sequence = 0;
beforeAll(async () => {
  memory = await prismaMemoryDatabase();
  state.db = memory.active;
  await memory.raw.currency.create({ data: { code: "EUR", name: "Euro" } });
  actorId = (
    await memory.raw.user.create({
      data: {
        name: "Owner",
        email: "cash-transaction@example.test",
        role: "ADMIN",
      },
    })
  ).id;
}, 30000);
afterAll(async () => memory?.close());

async function fixture() {
  const project = await memory.raw.project.create({
    data: {
      code: `CASH-${++sequence}`,
      name: "Cash tests",
      reportingCurrencyCode: "EUR",
    },
  });
  const order = await memory.raw.procurementOrder.create({
    data: {
      projectId: project.id,
      orderNumber: `ORDER-${sequence}`,
      packageName: "Furniture",
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
      costLines: {
        create: { category: "SUPPLIER_PURCHASE", originalAmount: "100" },
      },
    },
  });
  const term = await memory.raw.paymentInstallment.create({
    data: {
      orderId: order.id,
      direction: "SUPPLIER_PAYMENT",
      sequence: 1,
      label: "Full amount",
      basis: "FIXED_AMOUNT",
      scheduledAmount: "100",
      currencyCode: "EUR",
    },
  });
  const bill = await memory.raw.clientBillingDocument.create({
    data: {
      projectId: project.id,
      documentType: "INVOICE",
      workflowStatus: "INVOICED",
      reference: `INV-${sequence}`,
      documentDate: new Date("2026-10-01"),
      currencyCode: "EUR",
      totalHt: "100",
      vatAmount: "20",
      totalTtc: "120",
    },
  });
  return { project, order, term, bill };
}

it("returns cash IDs and rolls both creations and their audits back with the caller", async () => {
  const { project, order, term, bill } = await fixture();
  const ids: string[] = [];
  await expect(
    memory.active.$transaction(async (tx) => {
      ids.push(
        await recordSettlementInTransaction(
          tx,
          actorId,
          {
            installmentId: term.id,
            amount: "20",
            settledAt: "2026-10-02",
          },
          { projectId: project.id, orderId: order.id },
        ),
      );
      ids.push(
        await recordClientReceiptInTransaction(
          tx,
          actorId,
          {
            billingDocumentId: bill.id,
            installmentId: null,
            amount: "20",
            receivedAt: "2026-10-02",
          },
          { projectId: project.id },
        ),
      );
      expect(
        ids.every((id) => typeof id === "string" && id.length === 36),
      ).toBe(true);
      throw new Error("Proposal completion failed");
    }),
  ).rejects.toThrow("Proposal completion failed");
  expect(
    await memory.raw.paymentSettlement.count({
      where: { installmentId: term.id },
    }),
  ).toBe(0);
  expect(
    await memory.raw.clientReceipt.count({
      where: { billingDocumentId: bill.id },
    }),
  ).toBe(0);
  expect(
    await memory.raw.auditEvent.count({ where: { entityId: { in: ids } } }),
  ).toBe(0);
});

it("rolls corrections and recoverable cancellations back with the caller", async () => {
  const { term, bill } = await fixture();
  const [payment, receipt] = await Promise.all([
    memory.raw.paymentSettlement.create({
      data: {
        installmentId: term.id,
        amount: "20",
        settledAt: new Date("2026-10-02"),
      },
    }),
    memory.raw.clientReceipt.create({
      data: {
        billingDocumentId: bill.id,
        amount: "20",
        receivedAt: new Date("2026-10-02"),
      },
    }),
  ]);
  await expect(
    memory.active.$transaction(async (tx) => {
      await updateSettlementInTransaction(tx, actorId, {
        id: payment.id,
        installmentId: term.id,
        amount: "30",
        settledAt: "2026-10-03",
        expectedVersion: cashEditVersion(payment),
      });
      await updateClientReceiptInTransaction(tx, actorId, {
        id: receipt.id,
        billingDocumentId: bill.id,
        installmentId: null,
        amount: "40",
        receivedAt: "2026-10-03",
        expectedVersion: cashEditVersion(receipt),
      });
      const nextPayment = await tx.paymentSettlement.findUniqueOrThrow({
        where: { id: payment.id },
      });
      const nextReceipt = await tx.clientReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
      });
      await deleteSettlementInTransaction(
        tx,
        actorId,
        payment.id,
        cashEditVersion(nextPayment),
      );
      await deleteClientReceiptInTransaction(
        tx,
        actorId,
        { id: receipt.id, billingDocumentId: bill.id },
        cashEditVersion(nextReceipt),
      );
      throw new Error("Proposal completion failed");
    }),
  ).rejects.toThrow("Proposal completion failed");
  const savedPayment = await memory.raw.paymentSettlement.findUniqueOrThrow({
    where: { id: payment.id },
  });
  const savedReceipt = await memory.raw.clientReceipt.findUniqueOrThrow({
    where: { id: receipt.id },
  });
  expect(savedPayment.amount.toString()).toBe("20");
  expect(savedReceipt.amount.toString()).toBe("20");
  expect(savedPayment.trashedAt).toBeNull();
  expect(savedReceipt.trashedAt).toBeNull();
  expect(
    await memory.raw.auditEvent.count({
      where: { entityId: { in: [payment.id, receipt.id] } },
    }),
  ).toBe(0);
});

it("rejects stale cancellation snapshots and retains originals when fresh cash is moved to Trash", async () => {
  const { term, bill } = await fixture();
  const payment = await memory.raw.paymentSettlement.create({
    data: {
      installmentId: term.id,
      amount: "20",
      settledAt: new Date("2026-10-02"),
    },
  });
  const receipt = await memory.raw.clientReceipt.create({
    data: {
      billingDocumentId: bill.id,
      amount: "20",
      receivedAt: new Date("2026-10-02"),
    },
  });
  const nextPayment = await memory.raw.paymentSettlement.update({
    where: { id: payment.id },
    data: { reference: "Corrected" },
  });
  const nextReceipt = await memory.raw.clientReceipt.update({
    where: { id: receipt.id },
    data: { reference: "Corrected" },
  });
  await expect(
    memory.active.$transaction((tx) =>
      deleteSettlementInTransaction(
        tx,
        actorId,
        payment.id,
        cashEditVersion(payment),
      ),
    ),
  ).rejects.toThrow("Changed since");
  await expect(
    memory.active.$transaction((tx) =>
      deleteClientReceiptInTransaction(
        tx,
        actorId,
        { id: receipt.id, billingDocumentId: bill.id },
        cashEditVersion(receipt),
      ),
    ),
  ).rejects.toThrow("Changed since");
  await memory.active.$transaction(async (tx) => {
    await deleteSettlementInTransaction(
      tx,
      actorId,
      payment.id,
      cashEditVersion(nextPayment),
    );
    await deleteClientReceiptInTransaction(
      tx,
      actorId,
      { id: receipt.id, billingDocumentId: bill.id },
      cashEditVersion(nextReceipt),
    );
  });
  expect(
    await memory.active.paymentSettlement.findUnique({
      where: { id: payment.id },
    }),
  ).toBeNull();
  expect(
    await memory.active.clientReceipt.findUnique({ where: { id: receipt.id } }),
  ).toBeNull();
  expect(
    (
      await memory.raw.paymentSettlement.findUniqueOrThrow({
        where: { id: payment.id },
      })
    ).trashedAt,
  ).not.toBeNull();
  expect(
    (
      await memory.raw.clientReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
      })
    ).trashedAt,
  ).not.toBeNull();
  expect(
    await memory.raw.auditEvent.count({
      where: { entityId: { in: [payment.id, receipt.id] }, action: "DELETED" },
    }),
  ).toBe(2);
});
