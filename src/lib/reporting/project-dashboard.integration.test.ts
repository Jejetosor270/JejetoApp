import { beforeAll, afterAll, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";
import { getProjectControl } from "./project-control";
import { getProjectClientBillingSummary } from "@/lib/billing/reporting";
import { sumKnown, difference } from "@/domain/finance/project-control";
import { businessToday, dateOnlyToDate } from "@/domain/payments/dates";
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

it("reconciles complete Project economics, approved budget, credits, refunds and VAT to exact records", async () => {
  const db = memory.raw;
  const today = dateOnlyToDate(businessToday());
  const project = await db.project.create({
    data: {
      code: "DASHBOARD",
      name: "Dashboard",
      reportingCurrencyCode: "EUR",
      estimatedPurchaseCostHt: "100",
      freightEstimateRate: "0.1",
      estimatedOtherCostHt: "20",
      defaultFreightMarkupRate: "0.2",
      targetMode: "EXPECTED_SELL",
      expectedSellHt: "300",
    },
  });
  const order = await db.procurementOrder.create({
    data: {
      projectId: project.id,
      orderNumber: "DASH-ORDER",
      packageName: "Package",
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
      pricingMode: "DIRECT_SELLING_PRICE",
      sellingPriceAmount: "150",
      costLines: {
        create: [
          { category: "SUPPLIER_PURCHASE", originalAmount: "80" },
          { category: "FREIGHT", originalAmount: "10" },
        ],
      },
      vatEntries: {
        create: {
          direction: "INPUT",
          treatment: "DOMESTIC",
          taxableBaseAmount: "80",
          vatAmount: "20",
          recoverability: "PARTIALLY_RECOVERABLE",
          recoverableRate: "0.5",
        },
      },
      paymentInstallments: {
        create: {
          direction: "SUPPLIER_PAYMENT",
          sequence: 1,
          label: "Paid",
          basis: "FIXED_AMOUNT",
          scheduledAmount: "100",
          currencyCode: "EUR",
          settlements: { create: { amount: "100", settledAt: today } },
        },
      },
    },
  });
  await db.financialCredit.create({
    data: {
      side: "SUPPLIER",
      orderId: order.id,
      reference: "DASH-SUP-CREDIT",
      reason: "Reviewed return",
      creditDate: today,
      totalHt: "10",
      vatAmount: "0",
      currencyCode: "EUR",
      reportingCurrencyCode: "EUR",
      refunds: { create: { amount: "10", refundDate: today } },
    },
  });
  const expense = await db.projectFreightExpense.create({
    data: {
      projectId: project.id,
      description: "Separate freight",
      expenseDate: today,
      currencyCode: "EUR",
      costAmountHt: "20",
      vatAmount: "4",
      vatTreatment: "DOMESTIC",
      recoverability: "PARTIALLY_RECOVERABLE",
      recoverableRate: "0.5",
      payments: { create: { amount: "24", paidAt: today } },
    },
  });
  const invoice = await db.clientBillingDocument.create({
    data: {
      projectId: project.id,
      reference: "DASH-INVOICE",
      documentType: "INVOICE",
      workflowStatus: "INVOICED",
      documentDate: today,
      currencyCode: "EUR",
      totalHt: "200",
      totalTtc: "240",
      vatAmount: "40",
      freightCoverageHt: "40",
      isProjectRemainderApproved: true,
      allocations: {
        create: {
          orderId: order.id,
          basis: "FIXED_AMOUNT",
          allocatedAmount: "100",
          freightCoverageHt: "20",
        },
      },
      receipts: { create: { amount: "240", receivedAt: today } },
    },
  });
  const clientCredit = await db.financialCredit.create({
    data: {
      side: "CLIENT",
      billingDocumentId: invoice.id,
      reference: "DASH-CLIENT-CREDIT",
      reason: "Freight correction",
      creditDate: today,
      totalHt: "20",
      vatAmount: "4",
      freightCoverageHt: "20",
      currencyCode: "EUR",
      reportingCurrencyCode: "EUR",
      refunds: { create: { amount: "24", refundDate: today } },
    },
  });
  for (const [reference, documentType, workflowStatus, totalHt] of [
    ["DASH-PENDING", "INVOICE", "TO_BE_INVOICED", "50"],
    ["DASH-DRAFT", "INVOICE", "DRAFT", "888"],
    ["DASH-QUOTE", "QUOTE", "TO_BE_INVOICED", "999"],
  ] as const)
    await db.clientBillingDocument.create({
      data: {
        projectId: project.id,
        reference,
        documentType,
        workflowStatus,
        totalHt,
        totalTtc: totalHt,
        currencyCode: "EUR",
        documentDate: today,
      },
    });
  const control = await getProjectControl(project.id);
  const metrics = control.dashboard.metrics;
  for (const [key, value] of Object.entries({
    cost: "112.0000",
    sell: "150.0000",
    profit: "38.0000",
    planned: "230.0000",
    invoiced: "180.0000",
    toInvoice: "50.0000",
    coverage: "30.0000",
    received: "216.0000",
    paid: "114.0000",
    cash: "102.0000",
    toCollect: "0.0000",
    toPay: "0.0000",
    expectedCost: "142.0000",
    expectedProfit: "88.0000",
    freightCost: "30.0000",
    freightTarget: "36.0000",
    freightInvoiced: "20.0000",
    freightReceived: "20.0000",
    vatOutput: "36.0000",
    vatInput: "12.0000",
    vatBalance: "24.0000",
  }))
    expect(metrics[key as keyof typeof metrics].value, key).toBe(value);
  for (const metric of Object.values(metrics))
    expect(sumKnown(metric.rows.map((row) => row.amount))).toBe(metric.value);
  expect(
    metrics.cost.rows.some((row) =>
      row.href.endsWith(`#freight-${expense.id}`),
    ),
  ).toBe(true);
  expect(
    control.dashboard.alerts.some(
      (alert) => alert.label === "Billing below target",
    ),
  ).toBe(true);
  expect(
    control.dashboard.alerts.some(
      (alert) => alert.label === "Cost payable review",
    ),
  ).toBe(true);
  const summary = await getProjectClientBillingSummary(project.id);
  expect(metrics.coverage.value).toBe(
    difference(summary?.coverageHt ?? null, metrics.sell.value),
  );
  expect(metrics.toCollect.value).toBe(summary?.outstandingTtc);
  await db.project.update({
    where: { id: project.id },
    data: { estimatedOtherCostHt: null },
  });
  const incomplete = await getProjectControl(project.id);
  expect(incomplete.dashboard.metrics.expectedCost.value).toBeNull();
  expect(incomplete.dashboard.metrics.expectedProfit.value).toBeNull();
  expect(incomplete.dashboard.metrics.cost.value).toBe("112.0000");
  await db.project.update({
    where: { id: project.id },
    data: { estimatedPurchaseCostHt: "1", estimatedOtherCostHt: "0" },
  });
  const exceeded = await getProjectControl(project.id);
  expect(exceeded.dashboard.metrics.expectedCost.value).toBe("13.1000");
  expect(
    exceeded.dashboard.alerts.some(
      (alert) => alert.label === "Budget exceeded",
    ),
  ).toBe(true);
  await db.financialCredit.update({
    where: { id: clientCredit.id },
    data: { reportingCurrencyCode: "USD" },
  });
  const invalidCreditFx = await getProjectControl(project.id);
  expect(invalidCreditFx.dashboard.metrics.coverage.value).toBeNull();
  expect(invalidCreditFx.dashboard.metrics.freightReceived.value).toBeNull();
});

it("preserves issued outstanding when only term FX is missing and excludes unrecognized cash", async () => {
  const db = memory.raw;
  const today = dateOnlyToDate(businessToday());
  const project = await db.project.create({
    data: { code: "DASH-FX", name: "FX", reportingCurrencyCode: "EUR" },
  });
  const invoice = await db.clientBillingDocument.create({
    data: {
      projectId: project.id,
      reference: "DASH-FX-INVOICE",
      documentType: "INVOICE",
      workflowStatus: "INVOICED",
      documentDate: today,
      currencyCode: "USD",
      fxRateToReporting: "0.9",
      totalHt: "100",
      totalTtc: "100",
      isProjectRemainderApproved: true,
      paymentInstallments: {
        create: {
          sequence: 1,
          label: "Missing expected FX",
          basis: "FIXED_AMOUNT",
          scheduledAmount: "100",
          currencyCode: "USD",
          dueDate: today,
        },
      },
    },
  });
  const quote = await db.clientBillingDocument.create({
    data: {
      projectId: project.id,
      reference: "DASH-EXCLUDED",
      documentType: "QUOTE",
      workflowStatus: "TO_BE_INVOICED",
      documentDate: today,
      currencyCode: "EUR",
      totalHt: "10",
      totalTtc: "10",
      receipts: { create: { amount: "10", receivedAt: today } },
    },
  });
  const result = await getProjectControl(project.id);
  expect(result.dashboard.metrics.toCollect.value).toBe("90.0000");
  expect(result.cashOutlook.outstandingIn).toBeNull();
  expect(result.dashboard.metrics.received.value).toBe("0.0000");
  expect(result.excludedReceiptCount).toBe(1);
  expect(
    result.dashboard.alerts.some(
      (alert) =>
        alert.label === "Excluded receipt" &&
        alert.note.includes(quote.reference),
    ),
  ).toBe(true);
  await db.clientBillingDocument.update({
    where: { id: invoice.id },
    data: { fxRateToReporting: null },
  });
  const missing = await getProjectControl(project.id);
  expect(missing.dashboard.metrics.invoiced.value).toBeNull();
  expect(missing.dashboard.metrics.toCollect.value).toBeNull();
  expect(missing.dashboard.metrics.coverage.value).toBeNull();
  expect(
    missing.dashboard.alerts.some((alert) => alert.href.includes(invoice.id)),
  ).toBe(true);
});

it("uses the same eligible coverage and aggregate FX rounding as the Projects list", async () => {
  const db = memory.raw;
  const project = await db.project.create({
    data: {
      code: "DASH-ROUND",
      name: "Rounding",
      reportingCurrencyCode: "EUR",
    },
  });
  for (const reference of ["ROUND-A", "ROUND-B", "ROUND-C"])
    await db.clientBillingDocument.create({
      data: {
        projectId: project.id,
        reference,
        documentType: "INVOICE",
        workflowStatus: "INVOICED",
        documentDate: dateOnlyToDate(businessToday()),
        currencyCode: "USD",
        fxRateToReporting: "0.3333333333",
        totalHt: "1",
        totalTtc: "1",
        isProjectRemainderApproved: true,
      },
    });
  const control = await getProjectControl(project.id);
  const billing = await getProjectClientBillingSummary(project.id);
  expect(control.dashboard.metrics.coverage.value).toBe("1.0000");
  expect(control.dashboard.metrics.coverage.value).toBe(billing?.coverageHt);
  expect(
    sumKnown(control.dashboard.metrics.coverage.rows.map((row) => row.amount)),
  ).toBe("1.0000");
});

it("keeps a complete full budget known when recorded HT has missing FX but no non-deductible VAT", async () => {
  const db = memory.raw;
  const project = await db.project.create({
    data: {
      code: "DASH-BUDGET-FX",
      name: "Budget FX",
      reportingCurrencyCode: "EUR",
      estimatedPurchaseCostHt: "100",
      freightEstimateRate: "0.1",
      estimatedOtherCostHt: "0",
    },
  });
  await db.procurementOrder.create({
    data: {
      projectId: project.id,
      orderNumber: "BUDGET-FOREIGN",
      packageName: "Foreign purchase",
      orderCurrencyCode: "USD",
      sellingCurrencyCode: "EUR",
      pricingMode: "DIRECT_SELLING_PRICE",
      sellingPriceAmount: "150",
      costLines: {
        create: { category: "SUPPLIER_PURCHASE", originalAmount: "80" },
      },
    },
  });
  await db.clientBillingDocument.create({
    data: {
      projectId: project.id,
      reference: "BUDGET-BILLING",
      documentType: "INVOICE",
      workflowStatus: "INVOICED",
      documentDate: dateOnlyToDate(businessToday()),
      currencyCode: "EUR",
      totalHt: "150",
      totalTtc: "150",
    },
  });
  const result = await getProjectControl(project.id);
  expect(result.dashboard.metrics.cost.value).toBeNull();
  expect(result.dashboard.metrics.expectedCost.value).toBe("110.0000");
  expect(result.dashboard.metrics.expectedProfit.value).toBe("40.0000");
});
