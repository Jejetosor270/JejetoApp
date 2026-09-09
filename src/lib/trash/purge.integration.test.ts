import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";
import { moveToTrash } from "./service";
import { emptyTrash } from "./purge";
import {
  recordClientReceipt,
  updateClientReceipt,
  getClientBillingDocument,
} from "@/lib/billing/billing";
let memory: Awaited<ReturnType<typeof prismaMemoryDatabase>>;
let actorId: string;
beforeAll(async () => {
  memory = await prismaMemoryDatabase();
  state.db = memory.active;
  await memory.raw.currency.create({ data: { code: "EUR", name: "Euro" } });
  actorId = (
    await memory.raw.user.create({
      data: { name: "Admin", email: "purge@example.invalid", role: "ADMIN" },
    })
  ).id;
}, 30000);
afterAll(async () => {
  await memory?.close();
});
async function fixture() {
  const project = await memory.raw.project.create({
    data: {
      code: randomUUID(),
      name: "Purge fixture",
      reportingCurrencyCode: "EUR",
    },
  });
  const order = await memory.raw.procurementOrder.create({
    data: {
      projectId: project.id,
      orderNumber: randomUUID(),
      packageName: "Fixture",
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
      dueDate: null,
    },
  });
  const cash = await memory.raw.paymentSettlement.create({
    data: {
      installmentId: term.id,
      amount: "40",
      settledAt: new Date("2026-09-09"),
    },
  });
  return { project, order, term, cash };
}
it("permanently removes trashed hierarchies and supporting costs, retaining live records and audits", async () => {
  const removed = await fixture();
  const retained = await fixture();
  await moveToTrash(actorId, "Project", [removed.project.id]);
  const before = await memory.raw.auditEvent.count();
  expect(await emptyTrash(actorId)).toBe(4);
  expect(
    await memory.raw.procurementOrder.findUnique({
      where: { id: removed.order.id },
    }),
  ).toBeNull();
  expect(
    await memory.raw.procurementOrderCostLine.count({
      where: { orderId: removed.order.id },
    }),
  ).toBe(0);
  expect(
    await memory.raw.paymentSettlement.findUnique({
      where: { id: retained.cash.id },
    }),
  ).not.toBeNull();
  expect(await memory.raw.auditEvent.count()).toBeGreaterThan(before);
  expect(
    await memory.raw.trashBatch.count({ where: { restoredAt: null } }),
  ).toBe(0);
});
it("rejects non-Administrators and rolls back when an active dependency exists", async () => {
  const manager = await memory.raw.user.create({
    data: {
      name: "Manager",
      email: "manager-purge@example.invalid",
      role: "MANAGER",
    },
  });
  await expect(emptyTrash(manager.id)).rejects.toThrow("Administrator");
  const rows = await fixture();
  await moveToTrash(actorId, "Project", [rows.project.id]);
  await memory.raw.paymentSettlement.update({
    where: { id: rows.cash.id },
    data: { trashedAt: null },
  });
  await expect(emptyTrash(actorId)).rejects.toThrow("active record");
  expect(
    await memory.raw.project.findUnique({ where: { id: rows.project.id } }),
  ).not.toBeNull();
  await memory.raw.paymentSettlement.update({
    where: { id: rows.cash.id },
    data: { trashedAt: new Date() },
  });
  expect(await emptyTrash(actorId)).toBe(4);
});

it("records and corrects partial payments on a matched Quote term once, then purges the cyclic hierarchy", async () => {
  const { project } = await fixture();
  const quote = await memory.raw.clientBillingDocument.create({
    data: {
      projectId: project.id,
      reference: randomUUID(),
      documentType: "QUOTE",
      currencyCode: "EUR",
      documentDate: new Date("2026-09-01"),
      totalHt: "100",
      totalTtc: "100",
    },
  });
  const term = await memory.raw.clientPaymentInstallment.create({
    data: {
      billingDocumentId: quote.id,
      sequence: 1,
      label: "Balance",
      basis: "FIXED_AMOUNT",
      currencyCode: "EUR",
      scheduledAmount: "100",
      dueDate: new Date("2026-09-01"),
    },
  });
  const invoice = await memory.raw.clientBillingDocument.create({
    data: {
      projectId: project.id,
      reference: randomUUID(),
      documentType: "INVOICE",
      currencyCode: "EUR",
      documentDate: new Date("2026-09-01"),
      totalHt: "100",
      totalTtc: "100",
      matchedInstallmentId: term.id,
    },
  });
  const input = {
    billingDocumentId: invoice.id,
    installmentId: term.id,
    amount: "40",
    receivedAt: "2026-09-09",
  };
  await recordClientReceipt(actorId, input);
  await recordClientReceipt(actorId, { ...input, amount: "50" });
  expect((await getClientBillingDocument(invoice.id))?.paid).toBe("90.0000");
  const receipt = await memory.raw.clientReceipt.findFirstOrThrow({
    where: { billingDocumentId: invoice.id, amount: "40" },
  });
  await updateClientReceipt(actorId, {
    ...input,
    id: receipt.id,
    amount: "45",
  });
  expect((await getClientBillingDocument(invoice.id))?.paid).toBe("95.0000");
  await expect(
    recordClientReceipt(actorId, { ...input, amount: "6" }),
  ).rejects.toThrow("outstanding balance");
  await moveToTrash(actorId, "Project", [project.id]);
  expect(await emptyTrash(actorId)).toBe(9);
  expect(
    await memory.raw.clientReceipt.count({
      where: { billingDocumentId: invoice.id },
    }),
  ).toBe(0);
});
