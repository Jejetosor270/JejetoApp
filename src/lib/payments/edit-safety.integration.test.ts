import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";
const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
import {
  createInstallment,
  getOrderPaymentSummary,
  updateInstallment,
  updateSettlement,
} from "./payments";
import {
  getClientBillingDocument,
  updateClientBillingInstallment,
  updateClientReceipt,
} from "@/lib/billing/billing";

let memory: Awaited<ReturnType<typeof prismaMemoryDatabase>>;
let actorId: string;
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
      data: { name: "Manager", email: "edits@example.test", role: "MANAGER" },
    })
  ).id;
}, 30000);
afterAll(async () => memory?.close());

let sequence = 0;
async function fixture() {
  const project = await memory.raw.project.create({
    data: {
      code: `EDIT-${++sequence}`,
      name: "Edit tests",
      reportingCurrencyCode: "EUR",
    },
  });
  const order = await memory.raw.procurementOrder.create({
    data: {
      projectId: project.id,
      orderNumber: `EDIT-${sequence}`,
      packageName: "Furniture",
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
      pricingMode: "DIRECT_SELLING_PRICE",
      sellingPriceAmount: "150",
      costLines: {
        create: [
          { category: "SUPPLIER_PURCHASE", originalAmount: "100" },
          { category: "FREIGHT", originalAmount: "20" },
        ],
      },
      paymentInstallments: {
        create: {
          direction: "SUPPLIER_PAYMENT",
          sequence: 1,
          label: "Deposit",
          basis: "FIXED_AMOUNT",
          scheduledAmount: "60",
          currencyCode: "EUR",
        },
      },
    },
    include: { paymentInstallments: true },
  });
  const bill = await memory.raw.clientBillingDocument.create({
    data: {
      projectId: project.id,
      documentType: "INVOICE",
      reference: `INV-${sequence}`,
      documentDate: new Date("2026-10-01"),
      currencyCode: "EUR",
      workflowStatus: "INVOICED",
      totalHt: "100",
      vatAmount: "20",
      totalTtc: "120",
      paymentInstallments: {
        create: [1, 2].map((index) => ({
          sequence: index,
          label: `Term ${index}`,
          basis: "FIXED_AMOUNT",
          scheduledAmount: "60",
          currencyCode: "EUR",
        })),
      },
    },
    include: { paymentInstallments: true },
  });
  return {
    order,
    bill,
    term: order.paymentInstallments[0]!,
    billTerm: bill.paymentInstallments[0]!,
  };
}

it("checks Supplier schedule limits inside the transaction and preserves previous terms", async () => {
  const { order, term } = await fixture();
  const input = {
    orderId: order.id,
    direction: "SUPPLIER_PAYMENT" as const,
    currencyCode: "EUR",
    basis: "FIXED_AMOUNT" as const,
    label: "Balance",
    fixedAmount: "60.0001",
  };
  await expect(createInstallment(actorId, input)).rejects.toThrow(
    "cannot exceed",
  );
  await createInstallment(actorId, { ...input, fixedAmount: "60" });
  expect(
    (
      await memory.raw.paymentInstallment.findUniqueOrThrow({
        where: { id: term.id },
      })
    ).scheduledAmount.toString(),
  ).toBe("60");
  expect(
    await memory.raw.paymentInstallment.count({ where: { orderId: order.id } }),
  ).toBe(2);
});

it("rejects stale Supplier edits after payment and fresh amounts below paid cash", async () => {
  const { order, term } = await fixture();
  const before = (await getOrderPaymentSummary(order.id)).supplier
    .installments[0]!;
  await memory.raw.paymentSettlement.create({
    data: {
      installmentId: term.id,
      amount: "20",
      settledAt: new Date("2026-10-02"),
    },
  });
  const edit = {
    id: term.id,
    orderId: order.id,
    direction: "SUPPLIER_PAYMENT" as const,
    currencyCode: "EUR",
    basis: "FIXED_AMOUNT" as const,
    label: "Reviewed",
    fixedAmount: "10",
    expectedVersion: before.editVersion,
  };
  await expect(updateInstallment(actorId, edit)).rejects.toThrow(
    "Changed since",
  );
  const latest = (await getOrderPaymentSummary(order.id)).supplier
    .installments[0]!;
  await expect(
    updateInstallment(actorId, {
      ...edit,
      expectedVersion: latest.editVersion,
    }),
  ).rejects.toThrow("below the amount already paid");
  await updateInstallment(actorId, {
    ...edit,
    fixedAmount: "60",
    expectedVersion: latest.editVersion,
  });
  await expect(
    updateInstallment(actorId, {
      ...edit,
      fixedAmount: "60",
      expectedVersion: latest.editVersion,
    }),
  ).rejects.toThrow("Changed since");
});

it("preserves an agreed Supplier percentage amount when only the date changes", async () => {
  const { order, term } = await fixture();
  await memory.raw.paymentInstallment.update({
    where: { id: term.id },
    data: { basis: "PERCENTAGE", percentageRate: "0.3", scheduledAmount: "30" },
  });
  const current = (await getOrderPaymentSummary(order.id)).supplier
    .installments[0]!;
  await updateInstallment(actorId, {
    id: term.id,
    orderId: order.id,
    direction: "SUPPLIER_PAYMENT",
    currencyCode: "EUR",
    basis: "PERCENTAGE",
    percentageRate: "0.3",
    label: current.label,
    dueDate: "2026-11-15",
    expectedVersion: current.editVersion,
  });
  const saved = await memory.raw.paymentInstallment.findUniqueOrThrow({
    where: { id: term.id },
  });
  expect(saved.percentageRate?.toString()).toBe("0.3");
  expect(saved.scheduledAmount.toString()).toBe("30");
  expect(saved.dueDate?.toISOString().slice(0, 10)).toBe("2026-11-15");
});

it("rejects stale cash corrections without changing the cash record", async () => {
  const { order, term } = await fixture();
  const cash = await memory.raw.paymentSettlement.create({
    data: {
      installmentId: term.id,
      amount: "20",
      settledAt: new Date("2026-10-02"),
    },
  });
  const view = (await getOrderPaymentSummary(order.id)).supplier
    .installments[0]!.settlements[0]!;
  await memory.raw.paymentSettlement.update({
    where: { id: cash.id },
    data: { reference: "Changed elsewhere" },
  });
  await expect(
    updateSettlement(actorId, {
      id: cash.id,
      installmentId: term.id,
      amount: "25",
      settledAt: "2026-10-02",
      expectedVersion: view.editVersion,
    }),
  ).rejects.toThrow("Changed since");
  expect(
    (
      await memory.raw.paymentSettlement.findUniqueOrThrow({
        where: { id: cash.id },
      })
    ).amount.toString(),
  ).toBe("20");
});

it("caps visible Billing terms after direct receipts without inventing term payments", async () => {
  const { bill } = await fixture();
  await memory.raw.clientReceipt.create({
    data: {
      billingDocumentId: bill.id,
      amount: "120",
      receivedAt: new Date("2026-10-02"),
    },
  });
  const view = await getClientBillingDocument(bill.id);
  expect(view?.outstanding).toBe("0.0000");
  expect(
    view?.paymentInstallments.map((term) => term.creditOutstandingAmount),
  ).toEqual(["0", "0"]);
  expect(
    view?.paymentInstallments.every((term) => term.receipts.length === 0),
  ).toBe(true);
});

it("guards Billing term versions and aggregate schedule limits", async () => {
  const { bill, billTerm } = await fixture();
  const term = (await getClientBillingDocument(bill.id))!
    .paymentInstallments[0]!;
  const input = {
    id: billTerm.id,
    billingDocumentId: bill.id,
    basis: "FIXED_AMOUNT" as const,
    label: "Reviewed",
    scheduledAmount: "61",
    expectedVersion: term.editVersion,
  };
  await expect(updateClientBillingInstallment(actorId, input)).rejects.toThrow(
    "cannot exceed",
  );
  await updateClientBillingInstallment(actorId, {
    ...input,
    scheduledAmount: "60",
  });
  await expect(
    updateClientBillingInstallment(actorId, {
      ...input,
      scheduledAmount: "60",
    }),
  ).rejects.toThrow("Changed since");
});

it("assigns an existing receipt without new cash and rejects invalid or stale targets", async () => {
  const { bill, billTerm } = await fixture();
  const receipt = await memory.raw.clientReceipt.create({
    data: {
      billingDocumentId: bill.id,
      amount: "50",
      receivedAt: new Date("2026-10-02"),
    },
  });
  const before = (await getClientBillingDocument(bill.id))!.receipts[0]!;
  const input = {
    id: receipt.id,
    billingDocumentId: bill.id,
    installmentId: billTerm.id,
    amount: "50",
    receivedAt: "2026-10-02",
    expectedVersion: before.editVersion,
  };
  await memory.raw.clientPaymentInstallment.update({
    where: { id: billTerm.id },
    data: { isCancelled: true },
  });
  await expect(updateClientReceipt(actorId, input)).rejects.toThrow(
    "active payment term",
  );
  await memory.raw.clientPaymentInstallment.update({
    where: { id: billTerm.id },
    data: { isCancelled: false, currencyCode: "USD" },
  });
  await expect(updateClientReceipt(actorId, input)).rejects.toThrow(
    "same currency",
  );
  await memory.raw.clientPaymentInstallment.update({
    where: { id: billTerm.id },
    data: { currencyCode: "EUR" },
  });
  await updateClientReceipt(actorId, input);
  await expect(updateClientReceipt(actorId, input)).rejects.toThrow(
    "Changed since",
  );
  expect(
    await memory.raw.clientReceipt.count({
      where: { billingDocumentId: bill.id },
    }),
  ).toBe(1);
  const after = await memory.raw.clientReceipt.findUniqueOrThrow({
    where: { id: receipt.id },
  });
  expect(after.amount.toString()).toBe("50");
  expect(after.installmentId).toBe(billTerm.id);
  await memory.raw.clientPaymentInstallment.update({
    where: { id: billTerm.id },
    data: { isCancelled: true },
  });
  const current = (await getClientBillingDocument(bill.id))!.receipts[0]!;
  await updateClientReceipt(actorId, {
    ...input,
    expectedVersion: current.editVersion,
    receivedAt: "2026-10-03",
    reference: "Corrected date",
  });
  const corrected = await memory.raw.clientReceipt.findUniqueOrThrow({
    where: { id: receipt.id },
  });
  expect(corrected.receivedAt.toISOString()).toContain("2026-10-03");
  expect(corrected.amount.toString()).toBe("50");
});

it("rejects ambiguous matched Quote terms without moving existing receipt cash", async () => {
  const { bill, billTerm } = await fixture();
  await memory.raw.clientBillingDocument.update({
    where: { id: bill.id },
    data: { documentType: "QUOTE" },
  });
  const first = await memory.raw.clientBillingDocument.create({
    data: {
      projectId: bill.projectId,
      documentType: "INVOICE",
      reference: "MATCH-A",
      documentDate: new Date("2026-10-01"),
      currencyCode: "EUR",
      workflowStatus: "INVOICED",
      totalHt: "50",
      vatAmount: "10",
      totalTtc: "60",
      matchedInstallmentId: billTerm.id,
    },
  });
  await memory.raw.clientBillingDocument.create({
    data: {
      projectId: bill.projectId,
      documentType: "INVOICE",
      reference: "MATCH-B",
      documentDate: new Date("2026-10-01"),
      currencyCode: "EUR",
      workflowStatus: "INVOICED",
      totalHt: "50",
      vatAmount: "10",
      totalTtc: "60",
      matchedInstallmentId: billTerm.id,
    },
  });
  const receipt = await memory.raw.clientReceipt.create({
    data: {
      billingDocumentId: first.id,
      amount: "20",
      receivedAt: new Date("2026-10-02"),
    },
  });
  const view = (await getClientBillingDocument(first.id))!;
  expect(view.paymentInstallments[0]?.balanceReviewRequired).toBe(true);
  expect(view.paymentInstallments[0]?.creditOutstandingAmount).toBeUndefined();
  await expect(
    updateClientReceipt(actorId, {
      id: receipt.id,
      billingDocumentId: first.id,
      installmentId: billTerm.id,
      amount: "20",
      receivedAt: "2026-10-02",
      expectedVersion: view.receipts[0]!.editVersion,
    }),
  ).rejects.toThrow("multiple Invoices");
  expect(
    (
      await memory.raw.clientReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
      })
    ).installmentId,
  ).toBeNull();
});
