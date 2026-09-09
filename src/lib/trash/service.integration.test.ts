import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: async () => ({ role: "ADMIN" }),
}));
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";
import { moveToTrash, restoreTrash } from "./service";
import {
  listClientCashInstallments,
  getProjectClientBillingSummary,
} from "@/lib/billing/reporting";
import { nextInstallmentSequence } from "@/lib/payments/sequence";
import { updateSettlement } from "@/lib/payments/payments";
import { listCashRecords } from "@/lib/payments/cash-list";

let memory: Awaited<ReturnType<typeof prismaMemoryDatabase>>;
let actorId: string;
beforeAll(async () => {
  memory = await prismaMemoryDatabase();
  state.db = memory.active;
  await memory.raw.currency.create({ data: { code: "EUR", name: "Euro" } });
  actorId = (
    await memory.raw.user.create({
      data: {
        name: "Test employee",
        email: "trash-test@example.invalid",
        role: "ADMIN",
      },
    })
  ).id;
}, 30000);
afterAll(async () => {
  await memory?.close();
});
async function fixture() {
  const db = memory.raw;
  const tag = randomUUID();
  const client = await db.client.create({
    data: {
      legalName: "Test Client",
      displayName: "Test Client",
      defaultCurrencyCode: "EUR",
    },
  });
  const supplier = await db.supplier.create({
    data: {
      legalName: "Test Supplier",
      displayName: "Test Supplier",
      defaultCurrencyCode: "EUR",
    },
  });
  const project = await db.project.create({
    data: {
      name: "Test Project",
      code: tag,
      clientId: client.id,
      reportingCurrencyCode: "EUR",
    },
  });
  const order = await db.procurementOrder.create({
    data: {
      projectId: project.id,
      supplierId: supplier.id,
      orderNumber: tag,
      packageName: "Test package",
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
    },
  });
  const invoice = await db.clientBillingDocument.create({
    data: {
      clientId: client.id,
      projectId: project.id,
      documentType: "INVOICE",
      reference: tag,
      documentDate: new Date("2026-09-01"),
      currencyCode: "EUR",
      totalHt: "100.1256",
      totalTtc: "100.1256",
    },
  });
  const installment = await db.paymentInstallment.create({
    data: {
      orderId: order.id,
      direction: "SUPPLIER_PAYMENT",
      sequence: 1,
      label: "Supplier deposit",
      basis: "FIXED_AMOUNT",
      scheduledAmount: "100",
      currencyCode: "EUR",
      dueDate: new Date("2026-10-01"),
    },
  });
  const payment = await db.paymentSettlement.create({
    data: {
      installmentId: installment.id,
      amount: "30.1256",
      settledAt: new Date("2026-09-01"),
    },
  });
  const receipt = await db.clientReceipt.create({
    data: {
      billingDocumentId: invoice.id,
      amount: "40.1256",
      receivedAt: new Date("2026-09-01"),
    },
  });
  return {
    client,
    supplier,
    project,
    order,
    invoice,
    installment,
    payment,
    receipt,
  };
}
it("removes Billing revenue, receipts and allocations, then restores exact financial results", async () => {
  const f = await fixture();
  await memory.raw.clientBillingAllocation.create({
    data: {
      billingDocumentId: f.invoice.id,
      orderId: f.order.id,
      basis: "FIXED_AMOUNT",
      allocatedAmount: "100.1256",
    },
  });
  const before = await getProjectClientBillingSummary(f.project.id);
  const batch = await moveToTrash(actorId, "ClientBillingDocument", [
    f.invoice.id,
  ]);
  expect(
    await memory.active.clientBillingDocument.findUnique({
      where: { id: f.invoice.id },
    }),
  ).toBeNull();
  expect(
    await memory.active.clientReceipt.count({ where: { id: f.receipt.id } }),
  ).toBe(0);
  expect(
    await memory.active.clientBillingAllocation.count({
      where: { billingDocumentId: f.invoice.id },
    }),
  ).toBe(0);
  const hidden = await getProjectClientBillingSummary(f.project.id);
  expect(hidden?.invoicedHt).toBe("0.0000");
  expect(hidden?.paidTtc).toBe("0.0000");
  await expect(
    memory.active.clientBillingDocument.update({
      where: { id: f.invoice.id },
      data: { reference: "Not allowed" },
    }),
  ).rejects.toThrow();
  await restoreTrash(actorId, batch);
  expect(await getProjectClientBillingSummary(f.project.id)).toEqual(before);
  expect(
    await memory.active.clientReceipt.count({ where: { id: f.receipt.id } }),
  ).toBe(1);
});
it("restores a Quote forecast while its matched Invoice and receipt are in Trash", async () => {
  const f = await fixture();
  const quote = await memory.raw.clientBillingDocument.create({
    data: {
      clientId: f.client.id,
      projectId: f.project.id,
      documentType: "QUOTE",
      reference: "Quote",
      documentDate: new Date("2026-09-01"),
      currencyCode: "EUR",
      totalHt: "100.1256",
      totalTtc: "100.1256",
    },
  });
  const installment = await memory.raw.clientPaymentInstallment.create({
    data: {
      billingDocumentId: quote.id,
      label: "Quote deposit",
      sequence: 1,
      basis: "FIXED_AMOUNT",
      scheduledAmount: "100.1256",
      currencyCode: "EUR",
      dueDate: new Date("2026-10-01"),
    },
  });
  await memory.raw.clientBillingDocument.update({
    where: { id: f.invoice.id },
    data: { matchedInstallmentId: installment.id },
  });
  await memory.raw.clientReceipt.update({
    where: { id: f.receipt.id },
    data: { installmentId: installment.id },
  });
  const before = await listClientCashInstallments([f.project.id]);
  const batch = await moveToTrash(actorId, "ClientBillingDocument", [
    f.invoice.id,
  ]);
  const forecast = await listClientCashInstallments([f.project.id]);
  expect(forecast).toHaveLength(1);
  expect(forecast[0]?.billingDocumentId).toBe(quote.id);
  expect(forecast[0]?.outstandingAmount).toBe("100.1256");
  await restoreTrash(actorId, batch);
  expect(await listClientCashInstallments([f.project.id])).toEqual(before);
});
it("restores a parent group without restoring a previously deleted child", async () => {
  const f = await fixture();
  const childBatch = await moveToTrash(actorId, "PaymentSettlement", [
    f.payment.id,
  ]);
  const parentBatch = await moveToTrash(actorId, "Client", [f.client.id]);
  expect(
    await memory.active.project.count({ where: { id: f.project.id } }),
  ).toBe(0);
  expect(
    await memory.active.procurementOrder.count({ where: { id: f.order.id } }),
  ).toBe(0);
  expect(
    await memory.active.supplier.count({ where: { id: f.supplier.id } }),
  ).toBe(1);
  await expect(restoreTrash(actorId, childBatch)).rejects.toThrow("parent");
  await restoreTrash(actorId, parentBatch);
  expect(
    await memory.active.paymentSettlement.count({
      where: { id: f.payment.id },
    }),
  ).toBe(0);
  await restoreTrash(actorId, childBatch);
  expect(
    await memory.active.paymentSettlement.count({
      where: { id: f.payment.id },
    }),
  ).toBe(1);
});
it("rejects an overpayment restoration atomically, then permits it after correcting the replacement", async () => {
  const f = await fixture();
  const batch = await moveToTrash(actorId, "ClientReceipt", [f.receipt.id]);
  const replacement = await memory.raw.clientReceipt.create({
    data: {
      billingDocumentId: f.invoice.id,
      amount: "80",
      receivedAt: new Date("2026-09-02"),
    },
  });
  await expect(restoreTrash(actorId, batch)).rejects.toThrow("overpayment");
  expect(
    await memory.active.clientReceipt.count({ where: { id: f.receipt.id } }),
  ).toBe(0);
  expect(
    (await memory.raw.trashBatch.findUnique({ where: { id: batch } }))
      ?.restoredAt,
  ).toBeNull();
  await moveToTrash(actorId, "ClientReceipt", [replacement.id]);
  await restoreTrash(actorId, batch);
  expect(
    (
      await memory.active.clientReceipt.findUnique({
        where: { id: f.receipt.id },
      })
    )?.amount.toString(),
  ).toBe("40.1256");
});
it("protects original parent currency and amounts when restoring a receipt", async () => {
  const f = await fixture();
  const batch = await moveToTrash(actorId, "ClientReceipt", [f.receipt.id]);
  await memory.raw.clientBillingDocument.update({
    where: { id: f.invoice.id },
    data: { totalHt: "200", totalTtc: "200" },
  });
  await expect(restoreTrash(actorId, batch)).rejects.toThrow(
    "changed since deletion",
  );
  await memory.raw.clientBillingDocument.update({
    where: { id: f.invoice.id },
    data: { totalHt: f.invoice.totalHt, totalTtc: f.invoice.totalTtc },
  });
  await restoreTrash(actorId, batch);
  expect(
    await memory.active.clientReceipt.count({ where: { id: f.receipt.id } }),
  ).toBe(1);
});
it("filters nested counts and relation conditions, while reserving sequence identities", async () => {
  const f = await fixture();
  const batch = await moveToTrash(actorId, "PaymentInstallment", [
    f.installment.id,
  ]);
  const order = await memory.active.procurementOrder.findUnique({
    where: { id: f.order.id },
    include: {
      paymentInstallments: { include: { settlements: true } },
      _count: { select: { paymentInstallments: true } },
    },
  });
  expect(order?.paymentInstallments).toEqual([]);
  expect(order?._count.paymentInstallments).toBe(0);
  expect(
    await memory.active.procurementOrder.count({
      where: { id: f.order.id, paymentInstallments: { some: {} } },
    }),
  ).toBe(0);
  expect(
    await memory.active.procurementOrder.count({
      where: { id: f.order.id, paymentInstallments: { none: {} } },
    }),
  ).toBe(1);
  expect(
    await nextInstallmentSequence(memory.raw, f.order.id, "SUPPLIER_PAYMENT"),
  ).toBe(2);
  await restoreTrash(actorId, batch);
  expect(
    await memory.active.paymentSettlement.count({
      where: { id: f.payment.id },
    }),
  ).toBe(1);
});
it("does not partially delete a selection containing a missing record", async () => {
  const f = await fixture();
  await expect(
    moveToTrash(actorId, "ClientBillingDocument", [f.invoice.id, randomUUID()]),
  ).rejects.toThrow("no longer available");
  expect(
    await memory.active.clientBillingDocument.count({
      where: { id: f.invoice.id },
    }),
  ).toBe(1);
});
it("edits a payment in place, audits it, and excludes its old amount from the overpayment check", async () => {
  const f = await fixture();
  await updateSettlement(actorId, {
    id: f.payment.id,
    installmentId: f.installment.id,
    amount: "90.1256",
    settledAt: "2026-09-03",
    reference: "Corrected",
    notes: "Checked",
    fxRate: "2",
  });
  const saved = await memory.active.paymentSettlement.findUnique({
    where: { id: f.payment.id },
  });
  expect(saved?.amount.toString()).toBe("90.1256");
  expect(saved?.reference).toBe("Corrected");
  expect(saved?.fxRateToReporting).toBeNull();
  expect(
    await memory.raw.auditEvent.count({
      where: { entityId: f.payment.id, action: "UPDATED" },
    }),
  ).toBe(1);
  await memory.raw.paymentSettlement.create({
    data: {
      installmentId: f.installment.id,
      amount: "9",
      settledAt: new Date("2026-09-03"),
    },
  });
  await expect(
    updateSettlement(actorId, {
      id: f.payment.id,
      installmentId: f.installment.id,
      amount: "92",
      settledAt: "2026-09-04",
    }),
  ).rejects.toThrow("exceed");
  expect(
    (
      await memory.active.paymentSettlement.findUnique({
        where: { id: f.payment.id },
      })
    )?.amount.toString(),
  ).toBe("90.1256");
  await expect(
    updateSettlement(actorId, {
      id: f.payment.id,
      installmentId: randomUUID(),
      amount: "80",
      settledAt: "2026-09-04",
    }),
  ).rejects.toThrow("original installment");
});
it("rejects restoration when replacement Order allocations would exceed Billing HT", async () => {
  const f = await fixture();
  await memory.raw.clientBillingAllocation.create({
    data: {
      billingDocumentId: f.invoice.id,
      orderId: f.order.id,
      basis: "FIXED_AMOUNT",
      allocatedAmount: "100.1256",
    },
  });
  const batch = await moveToTrash(actorId, "ProcurementOrder", [f.order.id]);
  const replacement = await memory.raw.procurementOrder.create({
    data: {
      projectId: f.project.id,
      supplierId: f.supplier.id,
      orderNumber: randomUUID(),
      packageName: "Replacement",
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
    },
  });
  await memory.raw.clientBillingAllocation.create({
    data: {
      billingDocumentId: f.invoice.id,
      orderId: replacement.id,
      basis: "FIXED_AMOUNT",
      allocatedAmount: "100.1256",
    },
  });
  await expect(restoreTrash(actorId, batch)).rejects.toThrow("allocation");
  expect(
    await memory.active.procurementOrder.count({ where: { id: f.order.id } }),
  ).toBe(0);
});
it("pages the separate cash workspaces with Project scope and derived installment status", async () => {
  const f = await fixture();
  const clientInstallment = await memory.raw.clientPaymentInstallment.create({
    data: {
      billingDocumentId: f.invoice.id,
      label: "Client balance",
      sequence: 1,
      basis: "FIXED_AMOUNT",
      scheduledAmount: "100.1256",
      currencyCode: "EUR",
      dueDate: new Date("2026-10-01"),
    },
  });
  for (const [kind, id] of [
    ["payment", f.payment.id],
    ["receipt", f.receipt.id],
    ["supplier-installment", f.installment.id],
    ["client-installment", clientInstallment.id],
  ] as const) {
    const filters = {
      kind,
      query: "",
      projectId: f.project.id,
      page: 1,
      pageSize: 1,
      direction: "desc" as const,
    };
    const page = await listCashRecords(filters);
    expect(page.total).toBe(1);
    expect(page.items[0]?.id).toBe(id);
    expect((await listCashRecords({ ...filters, page: 2 })).items).toEqual([]);
  }
  expect(
    (
      await listCashRecords({
        kind: "supplier-installment",
        query: "",
        projectId: f.project.id,
        page: 1,
        pageSize: 25,
        direction: "asc",
        status: "PAID",
      })
    ).total,
  ).toBe(0);
});
