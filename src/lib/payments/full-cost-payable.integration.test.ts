import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";
const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
import { getOrder } from "@/lib/procurement/orders";
import { saveRecordStatus } from "./record-status";
import { loadCreditSource, sourceCreditPosition } from "@/lib/credits/source";

let memory: Awaited<ReturnType<typeof prismaMemoryDatabase>>;
beforeAll(async () => {
  memory = await prismaMemoryDatabase();
  state.db = memory.active;
}, 30000);
afterAll(async () => memory?.close());

it("reconciles full Order payable, credit cash limits and payment completion without rewriting existing terms", async () => {
  const db = memory.raw;
  await db.currency.create({ data: { code: "EUR", name: "Euro" } });
  const actor = await db.user.create({
    data: { name: "Manager", email: "payable@example.test", role: "MANAGER" },
  });
  const project = await db.project.create({
    data: {
      code: "FULL-COST",
      name: "Test Project",
      reportingCurrencyCode: "EUR",
    },
  });
  const order = await db.procurementOrder.create({
    data: {
      projectId: project.id,
      orderNumber: "FULL-COST",
      packageName: "Coffee table",
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
      pricingMode: "DIRECT_SELLING_PRICE",
      sellingPriceAmount: "4807",
      costLines: {
        create: [
          { category: "SUPPLIER_PURCHASE", originalAmount: "3450" },
          { category: "FREIGHT", originalAmount: "280" },
        ],
      },
      vatEntries: {
        create: {
          direction: "INPUT",
          treatment: "DOMESTIC",
          taxableBaseAmount: "3730",
          vatRate: "0.2",
          vatAmount: "746",
          recoverability: "RECOVERABLE",
          recoverableRate: "1",
        },
      },
      paymentInstallments: {
        create: {
          direction: "SUPPLIER_PAYMENT",
          sequence: 1,
          label: "Full amount",
          basis: "PERCENTAGE",
          percentageRate: "1",
          scheduledAmount: "4196",
          currencyCode: "EUR",
          dueDate: new Date("2026-11-06"),
          settlements: {
            create: { amount: "2238", settledAt: new Date("2026-10-01") },
          },
        },
      },
    },
    include: { paymentInstallments: { include: { settlements: true } } },
  });
  const before = await getOrder(order.id);
  expect(before?.supplierPayment).toMatchObject({
    totalPayable: "4476",
    paid: "2238",
    outstanding: "2238",
  });
  expect(before?.costs.economicLandedCost).toBe("3730");
  expect(before?.totalSellingRevenue).toBe("4807");
  const creditSource = await loadCreditSource(db, {
    side: "SUPPLIER",
    sourceId: order.id,
  });
  expect(creditSource.original.totalTtc).toBe("4476.0000");
  expect(creditSource.original.totalHt).toBe("3450");
  expect(sourceCreditPosition(creditSource).cash.outstanding).toBe("2238.0000");
  await saveRecordStatus(actor.id, {
    kind: "order",
    id: order.id,
    value: "PAID",
    paymentDate: "2026-10-07",
  });
  expect((await getOrder(order.id))?.supplierPayment).toMatchObject({
    totalPayable: "4476",
    paid: "4476",
    outstanding: "0",
    status: "PAID",
  });
  const oldTerm = order.paymentInstallments[0];
  if (!oldTerm) throw new Error("Expected original term");
  const stored = await db.paymentInstallment.findUniqueOrThrow({
    where: { id: oldTerm.id },
    include: { settlements: true },
  });
  expect(stored.scheduledAmount.toString()).toBe("4196");
  expect(stored.dueDate).toEqual(new Date("2026-11-06"));
  expect(
    stored.settlements.some(
      (row) =>
        row.id === oldTerm.settlements[0]?.id &&
        row.amount.toString() === "2238",
    ),
  ).toBe(true);
  expect(
    await db.paymentInstallment.count({
      where: {
        orderId: order.id,
        label: "Remaining balance",
        scheduledAmount: "280",
      },
    }),
  ).toBe(1);
  const count = await db.paymentSettlement.count();
  await saveRecordStatus(actor.id, {
    kind: "order",
    id: order.id,
    value: "PAID",
  });
  expect(await db.paymentSettlement.count()).toBe(count);
});
