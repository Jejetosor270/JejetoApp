import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";

const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));

import { prismaMemoryDatabase } from "@/test/prisma-memory-database";
import {
  getProjectsFundingCoverage,
  getProjectsInvoiceCoverage,
} from "./funding-coverage";
import { getProjectsClientBillingSummaries } from "@/lib/billing/reporting";

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
afterAll(async () => memory.close());

it("uses full issued HT after credits, independently of allocation and approval", async () => {
  const db = memory.raw;
  const project = await db.project.create({
    data: {
      code: "ISSUED-COVERAGE",
      name: "Issued",
      reportingCurrencyCode: "EUR",
    },
  });
  const order = await db.procurementOrder.create({
    data: {
      projectId: project.id,
      orderNumber: "ISSUED-ORDER",
      packageName: "Order",
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
      pricingMode: "DIRECT_SELLING_PRICE",
      sellingPriceAmount: "200",
      costLines: {
        create: { category: "SUPPLIER_PURCHASE", originalAmount: "100" },
      },
    },
  });
  const issued = await db.clientBillingDocument.create({
    data: {
      projectId: project.id,
      reference: "ISSUED",
      documentType: "INVOICE",
      workflowStatus: "INVOICED",
      documentDate: new Date("2026-10-01"),
      currencyCode: "EUR",
      totalHt: "100",
      totalTtc: "120",
      vatAmount: "20",
      isProjectRemainderApproved: false,
    },
  });
  await db.financialCredit.create({
    data: {
      billingDocumentId: issued.id,
      side: "CLIENT",
      reference: "CREDIT",
      reason: "Correction",
      creditDate: new Date("2026-10-02"),
      currencyCode: "EUR",
      reportingCurrencyCode: "EUR",
      totalHt: "20",
      vatAmount: "4",
    },
  });
  await db.clientBillingDocument.create({
    data: {
      projectId: project.id,
      reference: "ISSUED-USD",
      documentType: "INVOICE",
      workflowStatus: "INVOICED",
      documentDate: new Date("2026-10-01"),
      currencyCode: "USD",
      fxRateToReporting: "0.8",
      totalHt: "200",
      totalTtc: "200",
    },
  });
  for (const [
    reference,
    documentType,
    workflowStatus,
    isCancelled,
    trashedAt,
  ] of [
    ["PLAN", "INVOICE", "TO_BE_INVOICED", false, null],
    ["DRAFT", "INVOICE", "DRAFT", false, null],
    ["QUOTE", "QUOTE", "INVOICED", false, null],
    ["CANCELLED", "INVOICE", "CANCELLED", true, null],
    ["TRASH", "INVOICE", "INVOICED", false, new Date()],
  ] as const) {
    await db.clientBillingDocument.create({
      data: {
        projectId: project.id,
        reference,
        documentType,
        workflowStatus,
        isCancelled,
        trashedAt,
        documentDate: new Date("2026-10-01"),
        currencyCode: "EUR",
        totalHt: "1000",
        totalTtc: "1000",
      },
    });
  }
  for (const [orderNumber, status, trashedAt] of [
    ["CANCELLED-ORDER", "CANCELLED", null],
    ["TRASH-ORDER", "ORDERED", new Date()],
  ] as const) {
    await db.procurementOrder.create({
      data: {
        projectId: project.id,
        orderNumber,
        packageName: "Excluded",
        orderCurrencyCode: "EUR",
        sellingCurrencyCode: "EUR",
        pricingMode: "DIRECT_SELLING_PRICE",
        sellingPriceAmount: "999",
        status,
        trashedAt,
        costLines: {
          create: { category: "SUPPLIER_PURCHASE", originalAmount: "100" },
        },
      },
    });
  }
  // 100 - 20 credit + (200 USD × .8) - 200 Order sell; no VAT or cash.
  expect((await getProjectsInvoiceCoverage([project])).get(project.id)).toBe(
    "40.0000",
  );
  expect(
    (await getProjectsFundingCoverage([project])).get(project.id)
      ?.fundingCoverageHt,
  ).toBe("-200.0000");
  await db.clientBillingAllocation.create({
    data: {
      billingDocumentId: issued.id,
      orderId: order.id,
      basis: "FIXED_AMOUNT",
      allocatedAmount: "50",
    },
  });
  await db.clientBillingDocument.update({
    where: { id: issued.id },
    data: { isProjectRemainderApproved: true },
  });
  expect((await getProjectsInvoiceCoverage([project])).get(project.id)).toBe(
    "40.0000",
  );
  expect(
    (await getProjectsFundingCoverage([project])).get(project.id)
      ?.fundingCoverageHt,
  ).toBe("-120.0000");
});

it("keeps missing invoice and credit FX incomplete, including mismatched credit snapshots", async () => {
  const db = memory.raw;
  const project = await db.project.create({
    data: { code: "COVERAGE-FX", name: "FX", reportingCurrencyCode: "EUR" },
  });
  const invoice = await db.clientBillingDocument.create({
    data: {
      projectId: project.id,
      reference: "FX-INVOICE",
      documentType: "INVOICE",
      workflowStatus: "INVOICED",
      documentDate: new Date("2026-10-01"),
      currencyCode: "USD",
      totalHt: "100",
      totalTtc: "100",
    },
  });
  expect(
    (await getProjectsInvoiceCoverage([project])).get(project.id),
  ).toBeNull();
  await db.clientBillingDocument.update({
    where: { id: invoice.id },
    data: { fxRateToReporting: "0.8" },
  });
  const credit = await db.financialCredit.create({
    data: {
      billingDocumentId: invoice.id,
      side: "CLIENT",
      reference: "FX-CREDIT",
      reason: "Correction",
      creditDate: new Date("2026-10-02"),
      currencyCode: "USD",
      reportingCurrencyCode: "EUR",
      totalHt: "20",
      vatAmount: "0",
    },
  });
  expect(
    (await getProjectsInvoiceCoverage([project])).get(project.id),
  ).toBeNull();
  await db.financialCredit.update({
    where: { id: credit.id },
    data: { fxRateToReporting: "0.9" },
  });
  expect((await getProjectsInvoiceCoverage([project])).get(project.id)).toBe(
    "62.0000",
  );
  await db.financialCredit.update({
    where: { id: credit.id },
    data: { reportingCurrencyCode: "USD" },
  });
  expect(
    (await getProjectsInvoiceCoverage([project])).get(project.id),
  ).toBeNull();
  expect(
    (await getProjectsClientBillingSummaries([project])).get(project.id),
  ).toMatchObject({
    invoicedComplete: false,
    invoiceMissingIds: [credit.id],
  });
  await db.financialCredit.update({
    where: { id: credit.id },
    data: { isCancelled: true },
  });
  expect((await getProjectsInvoiceCoverage([project])).get(project.id)).toBe(
    "80.0000",
  );
});

it("shows zero for empty Projects and incomplete for unknown active Order sell", async () => {
  const project = await memory.raw.project.create({
    data: {
      code: "EMPTY-COVERAGE",
      name: "Empty",
      reportingCurrencyCode: "EUR",
    },
  });
  expect(await getProjectsInvoiceCoverage([])).toEqual(new Map());
  expect((await getProjectsInvoiceCoverage([project])).get(project.id)).toBe(
    "0.0000",
  );
  await memory.raw.procurementOrder.create({
    data: {
      projectId: project.id,
      orderNumber: "UNKNOWN-SELL",
      packageName: "Unknown",
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
      pricingMode: "DIRECT_SELLING_PRICE",
    },
  });
  expect(
    (await getProjectsInvoiceCoverage([project])).get(project.id),
  ).toBeNull();
});

it("keeps zero Invoice HT known without inventing an FX rate", async () => {
  const project = await memory.raw.project.create({
    data: {
      code: "ZERO-COVERAGE",
      name: "Zero HT",
      reportingCurrencyCode: "EUR",
    },
  });
  await memory.raw.clientBillingDocument.create({
    data: {
      projectId: project.id,
      reference: "ZERO-HT",
      documentType: "INVOICE",
      workflowStatus: "INVOICED",
      documentDate: new Date("2026-10-01"),
      currencyCode: "USD",
      totalHt: "0",
      totalTtc: "0",
    },
  });
  expect((await getProjectsInvoiceCoverage([project])).get(project.id)).toBe(
    "0.0000",
  );
});
