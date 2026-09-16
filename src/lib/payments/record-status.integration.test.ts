import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";
import { saveRecordStatus } from "./record-status";
import { getOrder } from "@/lib/procurement/orders";
import { getClientBillingDocument } from "@/lib/billing/billing";
import { recordPaymentStatusLabel } from "@/domain/payments/record-status";
let memory: Awaited<ReturnType<typeof prismaMemoryDatabase>>;
let actorId: string, orderId: string, billingId: string;
beforeAll(async () => {
  memory = await prismaMemoryDatabase();
  state.db = memory.active;
  const db = memory.raw;
  await db.currency.create({ data: { code: "EUR", name: "Euro" } });
  actorId = (
    await db.user.create({
      data: {
        name: "Manager",
        email: "status@example.invalid",
        role: "MANAGER",
      },
    })
  ).id;
  const project = await db.project.create({
    data: { name: "Test", code: "STATUS", reportingCurrencyCode: "EUR" },
  });
  orderId = (
    await db.procurementOrder.create({
      data: {
        orderNumber: "STATUS",
        packageName: "Test",
        projectId: project.id,
        orderCurrencyCode: "EUR",
        sellingCurrencyCode: "EUR",
        costLines: {
          create: { category: "SUPPLIER_PURCHASE", originalAmount: "100" },
        },
      },
    })
  ).id;
  billingId = (
    await db.clientBillingDocument.create({
      data: {
        reference: "STATUS",
        projectId: project.id,
        currencyCode: "EUR",
        documentType: "INVOICE",
        totalHt: "100",
        totalTtc: "120",
        vatAmount: "20",
        documentDate: new Date("2026-09-01"),
      },
    })
  ).id;
  await db.paymentInstallment.create({
    data: {
      orderId,
      direction: "SUPPLIER_PAYMENT",
      sequence: 1,
      label: "Deposit",
      basis: "FIXED_AMOUNT",
      scheduledAmount: "100",
      currencyCode: "EUR",
      dueDate: new Date("2000-01-01"),
    },
  });
}, 30000);
afterAll(async () => {
  await memory.close();
});

it("records partial cash, then only the full remaining balance, and repeated Paid is idempotent", async () => {
  await saveRecordStatus(actorId, {
    kind: "order",
    id: orderId,
    value: "PARTIALLY_PAID",
    amount: "25",
    paymentDate: "2026-09-01",
  });
  expect((await getOrder(orderId))?.supplierPayment.paid).toBe("25");
  await saveRecordStatus(actorId, {
    kind: "order",
    id: orderId,
    value: "PAID",
  });
  const order = await getOrder(orderId);
  expect(order?.supplierPayment.paid).toBe("100");
  expect(order?.supplierPayment.outstanding).toBe("0");
  expect(order?.paymentStatusOverride).toBeNull();
  expect(recordPaymentStatusLabel(order?.supplierPayment.status ?? "")).toBe(
    "Paid",
  );
  expect(await memory.raw.paymentSettlement.count()).toBe(2);
  await saveRecordStatus(actorId, {
    kind: "order",
    id: orderId,
    value: "PAID",
  });
  expect(await memory.raw.paymentSettlement.count()).toBe(2);
  expect((await getClientBillingDocument(billingId))?.paid).toBe("0.0000");
  await expect(
    saveRecordStatus(actorId, { kind: "order", id: orderId, value: "UNPAID" }),
  ).rejects.toThrow("actual payments");
  await expect(
    saveRecordStatus(actorId, {
      kind: "billing",
      id: billingId,
      value: "PAID",
    }),
  ).rejects.toThrow("Billing status selector");
});

it("preserves Billing cancellation safeguards and retains actual Order cash on cancellation", async () => {
  const receipt = await memory.raw.clientReceipt.create({
    data: {
      billingDocumentId: billingId,
      amount: "10",
      receivedAt: new Date("2026-09-01"),
    },
  });
  await expect(
    saveRecordStatus(actorId, {
      kind: "billing",
      id: billingId,
      value: "CANCEL",
    }),
  ).rejects.toThrow("Correct recorded payments");
  expect(
    (
      await memory.raw.clientBillingDocument.findUniqueOrThrow({
        where: { id: billingId },
      })
    ).isCancelled,
  ).toBe(false);
  await saveRecordStatus(actorId, {
    kind: "order",
    id: orderId,
    value: "CANCEL",
  });
  expect(
    (
      await memory.raw.procurementOrder.findUniqueOrThrow({
        where: { id: orderId },
      })
    ).status,
  ).toBe("CANCELLED");
  expect(await memory.raw.paymentSettlement.count()).toBe(2);
  // Disposable fixture only: a receipt-free Billing document may be cancelled.
  await memory.raw.clientReceipt.delete({ where: { id: receipt.id } });
  await saveRecordStatus(actorId, {
    kind: "billing",
    id: billingId,
    value: "CANCEL",
  });
  expect(
    (
      await memory.raw.clientBillingDocument.findUniqueOrThrow({
        where: { id: billingId },
      })
    ).isCancelled,
  ).toBe(true);
});

it("rejects read-only/inactive actors, invalid statuses and trashed targets", async () => {
  const viewer = await memory.raw.user.create({
    data: {
      name: "Viewer",
      email: "viewer-status@example.invalid",
      role: "USER",
    },
  });
  await expect(
    saveRecordStatus(viewer.id, {
      kind: "order",
      id: orderId,
      value: "UNPAID",
    }),
  ).rejects.toThrow("Manager");
  await memory.raw.user.update({
    where: { id: actorId },
    data: { isActive: false },
  });
  await expect(
    saveRecordStatus(actorId, { kind: "order", id: orderId, value: "UNPAID" }),
  ).rejects.toThrow("active");
  await memory.raw.user.update({
    where: { id: actorId },
    data: { isActive: true },
  });
  await expect(
    saveRecordStatus(actorId, { kind: "order", id: orderId, value: "INVALID" }),
  ).rejects.toThrow();
  await memory.raw.procurementOrder.update({
    where: { id: orderId },
    data: { trashedAt: new Date() },
  });
  await expect(
    saveRecordStatus(actorId, { kind: "order", id: orderId, value: "AUTO" }),
  ).rejects.toThrow();
});
