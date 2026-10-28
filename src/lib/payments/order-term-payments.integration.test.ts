import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";
import { readReconciliationCash } from "@/lib/reconciliation/cash";

const state = vi.hoisted(() => ({
  db: undefined as PrismaClient | undefined,
  failAudit: false,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
vi.mock("@/lib/audit/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit/events")>();
  return {
    ...actual,
    writeAuditEvent: async (
      ...args: Parameters<typeof actual.writeAuditEvent>
    ) => {
      if (state.failAudit && args[2].entityType === "INSTALLMENT")
        throw new Error("Audit unavailable");
      return actual.writeAuditEvent(...args);
    },
  };
});

import {
  getOrderTermPayments,
  markSupplierTermUnpaid,
} from "./order-term-payments";

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
        name: "Manager",
        email: "term-corrections@example.invalid",
        role: "MANAGER",
      },
    })
  ).id;
}, 30000);
beforeEach(() => {
  state.failAudit = false;
});
afterAll(async () => memory?.close());

async function fixture() {
  const project = await memory.raw.project.create({
    data: {
      name: "Payment correction",
      code: `TERM-${++sequence}`,
      reportingCurrencyCode: "EUR",
    },
  });
  const order = await memory.raw.procurementOrder.create({
    data: {
      projectId: project.id,
      orderNumber: `TERM-${sequence}`,
      packageName: "Furniture",
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
      costLines: {
        create: { category: "SUPPLIER_PURCHASE", originalAmount: "100" },
      },
      paymentInstallments: {
        create: [
          {
            direction: "SUPPLIER_PAYMENT",
            sequence: 1,
            label: "Deposit",
            basis: "FIXED_AMOUNT",
            scheduledAmount: "60",
            currencyCode: "EUR",
            settlements: {
              create: ["20", "40"].map((amount) => ({
                amount,
                settledAt: new Date("2026-10-02"),
              })),
            },
          },
          {
            direction: "SUPPLIER_PAYMENT",
            sequence: 2,
            label: "Balance",
            basis: "FIXED_AMOUNT",
            scheduledAmount: "40",
            currencyCode: "EUR",
            settlements: {
              create: { amount: "10", settledAt: new Date("2026-10-03") },
            },
          },
        ],
      },
    },
  });
  const data = await getOrderTermPayments(order.id);
  const term = data?.terms.find((row) => row.sequence === 1);
  const other = data?.terms.find((row) => row.sequence === 2);
  if (!term || !other) throw new Error("Missing fixture terms");
  const input = {
    orderId: order.id,
    termId: term.id,
    payments: term.settlements.map((payment) => {
      if (!payment.editVersion) throw new Error("Missing payment version");
      return { id: payment.id, version: payment.editVersion };
    }),
    reason: "Payment recorded by mistake",
  };
  return { order, term, other, input };
}

it("loads Supplier terms only and undoes one term's reviewed cash without touching other terms", async () => {
  const { order, term, other, input } = await fixture();
  await memory.raw.paymentInstallment.create({
    data: {
      orderId: order.id,
      direction: "CLIENT_RECEIPT",
      sequence: 1,
      label: "Legacy",
      basis: "FIXED_AMOUNT",
      scheduledAmount: "100",
      currencyCode: "EUR",
    },
  });
  expect((await getOrderTermPayments(order.id))?.terms).toHaveLength(2);
  const statement = await memory.raw.bankStatementImport.create({
    data: {
      accountLabel: "Test account",
      accountKey: `account-${sequence}`,
      currencyCode: "EUR",
      fingerprint: "a".repeat(64),
      lines: {
        create: {
          rowNumber: 1,
          bookedAt: new Date("2026-10-02"),
          direction: "SUPPLIER_PAYMENT",
          amount: "20",
        },
      },
    },
    include: { lines: true },
  });
  const line = statement.lines[0];
  const payment = input.payments[0];
  if (!line || !payment) throw new Error("Missing bank fixture");
  const match = await memory.raw.bankReconciliationMatch.create({
    data: {
      lineId: line.id,
      cashKind: "SUPPLIER_PAYMENT",
      cashRecordId: payment.id,
      cashFingerprint: "b".repeat(64),
    },
  });

  await markSupplierTermUnpaid(actorId, input);

  const after = await getOrderTermPayments(order.id);
  expect(after?.terms.find((row) => row.id === term.id)).toMatchObject({
    paidAmount: "0",
    outstandingAmount: "60",
    settlements: [],
  });
  expect(after?.terms.find((row) => row.id === other.id)?.paidAmount).toBe(
    "10",
  );
  const retained = await memory.raw.paymentSettlement.findMany({
    where: { installmentId: term.id },
  });
  expect(retained).toHaveLength(2);
  expect(retained.every((row) => row.trashedAt !== null)).toBe(true);
  expect(
    await memory.raw.trashRecord.count({
      where: { recordId: { in: input.payments.map((row) => row.id) } },
    }),
  ).toBe(2);
  expect(
    await memory.raw.bankReconciliationMatch.findUnique({
      where: { id: match.id },
    }),
  ).not.toBeNull();
  expect(
    await readReconciliationCash(memory.active, {
      ids: [{ kind: "SUPPLIER_PAYMENT", id: payment.id }],
    }),
  ).toEqual([]);
  expect(
    await memory.raw.auditEvent.findFirst({
      where: { entityType: "INSTALLMENT", entityId: term.id },
    }),
  ).toMatchObject({
    actorId,
    metadata: { orderId: order.id, reason: input.reason },
  });
  await expect(markSupplierTermUnpaid(actorId, input)).rejects.toThrow(
    "Payments changed",
  );
});

it.each(["changed", "new", "moved"] as const)(
  "rejects %s cash since the reviewed panel opened",
  async (change) => {
    const { term, other, input } = await fixture();
    const payment = input.payments[0];
    if (!payment) throw new Error("Missing payment");
    if (change === "changed")
      await memory.raw.paymentSettlement.update({
        where: { id: payment.id },
        data: { reference: "Corrected elsewhere" },
      });
    else if (change === "new")
      await memory.raw.paymentSettlement.create({
        data: {
          installmentId: term.id,
          amount: "1",
          settledAt: new Date("2026-10-04"),
        },
      });
    else
      await memory.raw.paymentSettlement.update({
        where: { id: payment.id },
        data: { installmentId: other.id },
      });
    await expect(markSupplierTermUnpaid(actorId, input)).rejects.toThrow(
      "Payments changed",
    );
    expect(
      await memory.raw.paymentSettlement.count({
        where: {
          id: { in: input.payments.map((row) => row.id) },
          trashedAt: { not: null },
        },
      }),
    ).toBe(0);
  },
);

it("rejects wrong ownership, legacy direction, missing reason and incomplete snapshots", async () => {
  const { order, term, input } = await fixture();
  const unrelated = await fixture();
  await expect(
    markSupplierTermUnpaid(actorId, { ...input, orderId: unrelated.order.id }),
  ).rejects.toThrow("active Order");
  await expect(
    markSupplierTermUnpaid(actorId, { ...input, reason: " " }),
  ).rejects.toThrow();
  await expect(
    markSupplierTermUnpaid(actorId, { ...input, payments: [] }),
  ).rejects.toThrow();
  await expect(
    markSupplierTermUnpaid(actorId, {
      ...input,
      payments: input.payments.slice(0, 1),
    }),
  ).rejects.toThrow("Payments changed");
  await expect(
    markSupplierTermUnpaid(actorId, {
      ...input,
      payments: [input.payments[0], input.payments[0]],
    }),
  ).rejects.toThrow("Payments changed");
  await memory.raw.paymentInstallment.update({
    where: { id: term.id },
    data: { direction: "CLIENT_RECEIPT" },
  });
  await expect(markSupplierTermUnpaid(actorId, input)).rejects.toThrow(
    "active Order",
  );
  expect((await getOrderTermPayments(order.id))?.terms).toHaveLength(1);
});

it.each(["USER", "inactive", "missing"] as const)(
  "rejects a %s actor inside the transaction",
  async (role) => {
    const { input } = await fixture();
    const actor =
      role === "missing"
        ? "00000000-0000-0000-0000-000000000000"
        : (
            await memory.raw.user.create({
              data: {
                name: "Restricted",
                email: `restricted-${sequence}@example.invalid`,
                role: role === "USER" ? "USER" : "MANAGER",
                isActive: role !== "inactive",
              },
            })
          ).id;
    await expect(markSupplierTermUnpaid(actor, input)).rejects.toThrow(
      "active Administrator or Manager",
    );
    expect(
      await memory.active.paymentSettlement.count({
        where: { installmentId: input.termId },
      }),
    ).toBe(2);
  },
);

it("rolls back every cash/trash change if the correction audit fails", async () => {
  const { input } = await fixture();
  const before = await memory.raw.trashBatch.count();
  state.failAudit = true;
  await expect(markSupplierTermUnpaid(actorId, input)).rejects.toThrow(
    "Audit unavailable",
  );
  expect(
    await memory.active.paymentSettlement.count({
      where: { installmentId: input.termId },
    }),
  ).toBe(2);
  expect(await memory.raw.trashBatch.count()).toBe(before);
  expect(
    await memory.raw.auditEvent.count({
      where: { entityType: "INSTALLMENT", entityId: input.termId },
    }),
  ).toBe(0);
});

it.each([false, true])(
  "preserves the credit-history blocker, including cancelled=%s credits",
  async (isCancelled) => {
    const { order, input } = await fixture();
    await memory.raw.financialCredit.create({
      data: {
        side: "SUPPLIER",
        orderId: order.id,
        reference: `CREDIT-${sequence}`,
        creditDate: new Date("2026-10-03"),
        reason: "Credit fixture",
        totalHt: "5",
        vatAmount: "0",
        currencyCode: "EUR",
        reportingCurrencyCode: "EUR",
        isCancelled,
      },
    });
    await expect(markSupplierTermUnpaid(actorId, input)).rejects.toThrow(
      "credit history",
    );
    expect(
      await memory.active.paymentSettlement.count({
        where: { installmentId: input.termId },
      }),
    ).toBe(2);
  },
);

it("rejects cancelled or unavailable Orders without changing recorded cash", async () => {
  const { order, input } = await fixture();
  await memory.raw.procurementOrder.update({
    where: { id: order.id },
    data: { status: "CANCELLED" },
  });
  expect((await getOrderTermPayments(order.id))?.cancelled).toBe(true);
  await expect(markSupplierTermUnpaid(actorId, input)).rejects.toThrow(
    "active Order",
  );
  await memory.raw.procurementOrder.update({
    where: { id: order.id },
    data: { trashedAt: new Date() },
  });
  expect(await getOrderTermPayments(order.id)).toBeNull();
  await expect(markSupplierTermUnpaid(actorId, input)).rejects.toThrow(
    "active Order",
  );
});
