import { beforeAll, afterAll, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";
import { getProjectControl } from "./project-control";
let memory: Awaited<ReturnType<typeof prismaMemoryDatabase>>;
beforeAll(async () => {
  memory = await prismaMemoryDatabase();
  state.db = memory.active;
  await memory.raw.currency.createMany({
    data: [
      { code: "EUR", name: "Euro" },
      { code: "USD", name: "Dollar" },
    ],
  });
}, 30000);
afterAll(async () => {
  await memory.close();
});

it("counts matched Quote receipts once, using Invoice freight and each receipt's FX; excludes Trash and unmatched Quotes", async () => {
  const db = memory.raw;
  const project = await db.project.create({
    data: {
      name: "Coverage",
      code: "coverage",
      reportingCurrencyCode: "EUR",
      defaultFreightMarkupRate: "0.15",
      estimatedPurchaseCostHt: "591700",
      freightEstimateRate: "0.10",
      estimatedFreightCostHt: "999",
    },
  });
  const quote = await db.clientBillingDocument.create({
    data: {
      projectId: project.id,
      documentType: "QUOTE",
      reference: "QUOTE",
      documentDate: new Date("2026-09-01"),
      currencyCode: "USD",
      totalHt: "2000",
      totalTtc: "2400",
      freightCoverageHt: "900",
      fxRateToReporting: "0.8",
    },
  });
  const term = await db.clientPaymentInstallment.create({
    data: {
      billingDocumentId: quote.id,
      sequence: 1,
      label: "Deposit",
      basis: "FIXED_AMOUNT",
      scheduledAmount: "1200",
      currencyCode: "USD",
    },
  });
  const invoice = await db.clientBillingDocument.create({
    data: {
      projectId: project.id,
      documentType: "INVOICE",
      reference: "INV",
      documentDate: new Date("2026-09-01"),
      currencyCode: "USD",
      totalHt: "1000",
      totalTtc: "1200",
      freightCoverageHt: "100",
      fxRateToReporting: "0.8",
      matchedInstallmentId: term.id,
    },
  });
  const payment = await db.clientReceipt.create({
    data: {
      billingDocumentId: quote.id,
      installmentId: term.id,
      amount: "600",
      receivedAt: new Date("2026-09-01"),
      fxRateToReporting: "0.9",
    },
  });
  await db.clientReceipt.create({
    data: {
      billingDocumentId: invoice.id,
      installmentId: term.id,
      amount: "300",
      receivedAt: new Date("2026-09-02"),
      fxRateToReporting: "1",
    },
  });
  await db.clientReceipt.create({
    data: {
      billingDocumentId: invoice.id,
      amount: "300",
      receivedAt: new Date("2026-09-02"),
      fxRateToReporting: "1",
      trashedAt: new Date(),
    },
  });
  await db.clientReceipt.create({
    data: {
      billingDocumentId: quote.id,
      amount: "300",
      receivedAt: new Date("2026-09-02"),
      fxRateToReporting: "1",
    },
  });
  const expense = await db.projectFreightExpense.create({
    data: {
      projectId: project.id,
      currencyCode: "EUR",
      description: "Freight",
      expenseDate: new Date("2026-09-01"),
      costAmountHt: "100",
      vatAmount: "20",
      vatTreatment: "DOMESTIC",
      recoverableRate: "0",
      recoverability: "NON_RECOVERABLE",
    },
  });
  await db.freightExpensePayment.create({
    data: {
      expenseId: expense.id,
      amount: "60",
      paidAt: new Date("2026-09-02"),
    },
  });
  const order = await db.procurementOrder.create({
    data: {
      projectId: project.id,
      packageName: "Package",
      orderNumber: "COV",
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
    },
  });
  const supplierTerm = await db.paymentInstallment.create({
    data: {
      orderId: order.id,
      direction: "SUPPLIER_PAYMENT",
      sequence: 1,
      label: "Supplier",
      basis: "FIXED_AMOUNT",
      scheduledAmount: "500",
      currencyCode: "EUR",
    },
  });
  await db.paymentSettlement.create({
    data: {
      installmentId: supplierTerm.id,
      amount: "200",
      settledAt: new Date("2026-09-02"),
    },
  });
  const report = await getProjectControl(project.id);
  expect(report.received).toBe("840.0000");
  expect(report.cash.paid).toBe("260.0000");
  expect(report.cash.net).toBe("580.0000");
  expect(report.excludedReceiptCount).toBe(1);
  expect(report.freightCoverage).toMatchObject({
    supplierHt: "100.0000",
    supplierMarkupHt: "15.0000",
    supplierSellHt: "115.0000",
    clientInvoicedHt: "80.0000",
    clientPaidHt: "70.0000",
    invoicedCoverageHt: "-35.0000",
    paidCoverageHt: "-45.0000",
  });
  expect(report.totals.billed).toBe("800.0000");
  expect(
    report.categories.find((row) => row.category === "freight")?.budget,
  ).toBe("59170.0000");
  expect(report.totals.budget).toBeNull();
  await db.clientReceipt.update({
    where: { id: payment.id },
    data: { fxRateToReporting: null },
  });
  const incomplete = await getProjectControl(project.id);
  expect(incomplete.received).toBeNull();
  expect(incomplete.cash.net).toBeNull();
  expect(incomplete.freightCoverage.clientPaidHt).toBeNull();
  expect(incomplete.freightCoverage.clientInvoicedHt).toBe("80.0000");
  await db.clientBillingDocument.update({
    where: { id: invoice.id },
    data: { isCancelled: true },
  });
  const cancelled = await getProjectControl(project.id);
  expect(cancelled.received).toBe("0.0000");
  expect(cancelled.freightCoverage.clientPaidHt).toBe("0.0000");
});
