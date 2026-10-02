import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";
import { getFinancialAttention } from "./financial-attention";
import { createOrder } from "@/lib/procurement/orders";
import { createOrderInputSchema } from "@/domain/procurement/validation";
let memory: Awaited<ReturnType<typeof prismaMemoryDatabase>>;
beforeAll(async () => {
  memory = await prismaMemoryDatabase();
  state.db = memory.active;
}, 30000);
afterAll(async () => {
  await memory.close();
});

it("loads real Project reminders, counts matched receipts once and excludes cancelled/trashed/archived records", async () => {
  const db = memory.raw;
  await db.currency.create({ data: { code: "EUR", name: "Euro" } });
  const actor = await db.user.create({
    data: {
      email: "attention@example.invalid",
      name: "Employee",
      role: "MANAGER",
    },
  });
  const supplier = await db.supplier.create({
    data: {
      legalName: "Supplier",
      displayName: "Supplier",
      defaultCurrencyCode: "EUR",
    },
  });
  const client = await db.client.create({
    data: {
      legalName: "Client",
      displayName: "Client",
      defaultCurrencyCode: "EUR",
    },
  });
  const project = await db.project.create({
    data: {
      code: "ATT",
      name: "Attention",
      reportingCurrencyCode: "EUR",
      clientId: client.id,
      status: "ACTIVE",
    },
  });
  const archived = await db.project.create({
    data: {
      code: "ARC",
      name: "Archived",
      reportingCurrencyCode: "EUR",
      status: "ARCHIVED",
    },
  });
  const base = {
    projectId: project.id,
    clientId: client.id,
    currencyCode: "EUR",
    documentDate: new Date("2026-09-20"),
    totalHt: "100",
    vatAmount: "20",
    totalTtc: "120",
  };
  const quote = await db.clientBillingDocument.create({
    data: { ...base, reference: "QUOTE", documentType: "QUOTE" },
  });
  const term = await db.clientPaymentInstallment.create({
    data: {
      billingDocumentId: quote.id,
      label: "Deposit",
      sequence: 1,
      basis: "FIXED_AMOUNT",
      scheduledAmount: "120",
      currencyCode: "EUR",
      dueDate: new Date("2026-09-21"),
    },
  });
  const invoice = await db.clientBillingDocument.create({
    data: {
      ...base,
      reference: "INVOICE",
      documentType: "INVOICE",
      workflowStatus: "INVOICED",
      matchedInstallmentId: term.id,
    },
  });
  await db.clientReceipt.create({
    data: {
      billingDocumentId: invoice.id,
      installmentId: term.id,
      amount: "20",
      receivedAt: new Date("2026-09-20"),
    },
  });
  const planned = await db.clientBillingDocument.create({
    data: {
      ...base,
      reference: "TO ISSUE",
      documentType: "INVOICE",
      workflowStatus: "TO_BE_INVOICED",
    },
  });
  await db.clientBillingDocument.createMany({
    data: [
      {
        ...base,
        reference: "CANCELLED",
        documentType: "INVOICE",
        workflowStatus: "CANCELLED",
      },
      {
        ...base,
        reference: "TRASH",
        documentType: "INVOICE",
        trashedAt: new Date(),
      },
      {
        ...base,
        projectId: archived.id,
        reference: "ARCHIVED",
        documentType: "INVOICE",
      },
    ],
  });
  const orderId = await createOrder(
    actor.id,
    createOrderInputSchema.parse({
      projectId: project.id,
      supplierId: supplier.id,
      orderNumber: "SUPPLIER",
      packageName: "Supplier",
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
      purchaseCost: "100",
      pricingMode: "PROJECT_MARKUP",
      freightTreatment: "NOT_APPLICABLE",
      status: "ORDERED",
      buildingIds: [],
    }),
  );
  await db.paymentInstallment.updateMany({
    where: { orderId },
    data: { dueDate: new Date("2026-09-25") },
  });
  const freight = await db.projectFreightExpense.create({
    data: {
      projectId: project.id,
      description: "Shipping",
      reference: "FREIGHT",
      costAmountHt: "10",
      currencyCode: "EUR",
      expenseDate: new Date("2026-09-20"),
      dueDate: new Date("2026-09-24"),
    },
  });
  const result = await getFinancialAttention(7, "2026-09-22");
  expect(result.projects.map((p) => p.id)).toEqual([project.id]);
  expect(
    result.issues.filter((row) => row.key === `term-due:${term.id}`),
  ).toHaveLength(1);
  expect(
    result.issues.find((row) => row.key === `term-due:${term.id}`),
  ).toMatchObject({
    amount: "100.0000",
    priority: "Overdue",
    reference: "INVOICE",
  });
  expect(
    result.issues.some((row) => row.key === `schedule:${invoice.id}`),
  ).toBe(false);
  expect(
    result.issues.some((row) => row.key === `issue-invoice:${planned.id}`),
  ).toBe(true);
  expect(
    result.issues.find((row) => row.key === `term-due:${freight.id}`)?.amount,
  ).toBe("10.0000");
  expect(
    result.issues.find((row) => row.key === `cash-gap-7:${project.id}`)?.amount,
  ).toBe("10.0000");
  expect(
    result.issues.some((row) =>
      ["QUOTE", "CANCELLED", "TRASH", "ARCHIVED"].includes(row.reference),
    ),
  ).toBe(false);
  await db.clientReceipt.create({
    data: {
      billingDocumentId: invoice.id,
      installmentId: term.id,
      amount: "100",
      receivedAt: new Date("2026-09-22"),
    },
  });
  expect(
    (await getFinancialAttention(7, "2026-09-22")).issues.some(
      (row) => row.key === `term-due:${term.id}`,
    ),
  ).toBe(false);
});

it("scopes Project attention without leaking another Project's issues", async () => {
  const project = await memory.raw.project.create({
    data: {
      code: "EMPTY",
      name: "Empty",
      reportingCurrencyCode: "EUR",
      status: "ACTIVE",
    },
  });
  const report = await getFinancialAttention(30, "2026-09-22", project.id);
  expect(report.projects.map((row) => row.id)).toEqual([project.id]);
  expect(report.issues.every((row) => row.projectId === project.id)).toBe(true);
  expect(
    (
      await getFinancialAttention(
        30,
        "2026-09-22",
        "00000000-0000-4000-8000-000000000001",
      )
    ).issues,
  ).toEqual([]);
});

it("reviews only archived issued balances, preserving original currency and matched-term uncertainty", async () => {
  const db = memory.raw;
  await db.currency.upsert({
    where: { code: "USD" },
    create: { code: "USD", name: "US Dollar" },
    update: {},
  });
  const project = await db.project.create({
    data: {
      code: "ARCHIVE-REVIEW",
      name: "Archived review",
      reportingCurrencyCode: "EUR",
      status: "ARCHIVED",
    },
  });
  const client = await db.client.create({
    data: {
      legalName: "Archive Client",
      displayName: "Archive Client",
      defaultCurrencyCode: "EUR",
    },
  });
  const base = {
    projectId: project.id,
    clientId: client.id,
    currencyCode: "EUR",
    documentDate: new Date("2026-09-01"),
    totalHt: "100",
    vatAmount: "20",
    totalTtc: "120",
    documentType: "INVOICE" as const,
  };
  const issued = await db.clientBillingDocument.create({
    data: { ...base, reference: "ARCHIVE-ISSUED" },
  });
  await db.clientReceipt.create({
    data: {
      billingDocumentId: issued.id,
      amount: "20",
      receivedAt: new Date("2026-09-02"),
    },
  });
  const paid = await db.clientBillingDocument.create({
    data: { ...base, reference: "ARCHIVE-PAID" },
  });
  await db.clientPaymentInstallment.create({
    data: {
      billingDocumentId: paid.id,
      sequence: 1,
      label: "Unassigned receipt covers this term",
      basis: "FIXED_AMOUNT",
      scheduledAmount: "120",
      currencyCode: "EUR",
    },
  });
  await db.clientReceipt.create({
    data: {
      billingDocumentId: paid.id,
      amount: "120",
      receivedAt: new Date("2026-09-02"),
    },
  });
  const foreign = await db.clientBillingDocument.create({
    data: { ...base, reference: "ARCHIVE-USD", currencyCode: "USD" },
  });
  await db.clientBillingDocument.createMany({
    data: [
      { ...base, reference: "ARCHIVE-DRAFT", workflowStatus: "DRAFT" },
      {
        ...base,
        reference: "ARCHIVE-PLANNED",
        workflowStatus: "TO_BE_INVOICED",
      },
      { ...base, reference: "ARCHIVE-QUOTE", documentType: "QUOTE" },
      { ...base, reference: "ARCHIVE-CANCELLED", isCancelled: true },
      { ...base, reference: "ARCHIVE-TRASHED", trashedAt: new Date() },
    ],
  });
  const quote = await db.clientBillingDocument.create({
    data: {
      ...base,
      reference: "ARCHIVE-MATCH-SOURCE",
      documentType: "QUOTE",
      currencyCode: "USD",
    },
  });
  const term = await db.clientPaymentInstallment.create({
    data: {
      billingDocumentId: quote.id,
      sequence: 1,
      label: "Foreign source",
      basis: "FIXED_AMOUNT",
      scheduledAmount: "120",
      currencyCode: "USD",
    },
  });
  const mismatch = await db.clientBillingDocument.create({
    data: {
      ...base,
      reference: "ARCHIVE-MATCH-REVIEW",
      matchedInstallmentId: term.id,
    },
  });
  const supplier = await db.supplier.create({
    data: {
      legalName: "Archive Supplier",
      displayName: "Archive Supplier",
      defaultCurrencyCode: "EUR",
    },
  });
  await db.procurementOrder.create({
    data: {
      orderNumber: "ARCHIVE-SUPPLIER-MIXED",
      packageName: "Mixed terms",
      projectId: project.id,
      supplierId: supplier.id,
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
      status: "ORDERED",
      pricingMode: "PROJECT_MARKUP",
      costLines: {
        create: { category: "SUPPLIER_PURCHASE", originalAmount: "100" },
      },
      paymentInstallments: {
        create: {
          direction: "SUPPLIER_PAYMENT",
          sequence: 1,
          label: "Foreign term",
          basis: "FIXED_AMOUNT",
          scheduledAmount: "200",
          currencyCode: "USD",
          settlements: {
            create: { amount: "140", settledAt: new Date("2026-09-01") },
          },
        },
      },
    },
  });
  const result = await getFinancialAttention(
    30,
    "2026-10-02",
    project.id,
    "archived",
  );
  expect(result.projects.map((row) => row.id)).toEqual([project.id]);
  expect(
    result.issues.find((row) => row.reference === issued.reference),
  ).toMatchObject({ amount: "100.0000", currency: "EUR", priority: "Review" });
  expect(
    result.issues.find((row) => row.reference === foreign.reference),
  ).toMatchObject({
    amount: "120.0000",
    currency: "USD",
    priority: "Incomplete",
  });
  expect(
    result.issues.find((row) => row.reference === mismatch.reference),
  ).toMatchObject({ amount: null, priority: "Incomplete" });
  expect(
    result.issues.find((row) => row.reference === "ARCHIVE-SUPPLIER-MIXED"),
  ).toMatchObject({ amount: null, priority: "Incomplete" });
  expect(
    result.issues.some((row) =>
      [
        "ARCHIVE-DRAFT",
        "ARCHIVE-PLANNED",
        "ARCHIVE-QUOTE",
        "ARCHIVE-CANCELLED",
        "ARCHIVE-TRASHED",
        "ARCHIVE-PAID",
      ].includes(row.reference),
    ),
  ).toBe(false);
  expect(
    (await getFinancialAttention(30, "2026-10-02", project.id)).issues,
  ).toEqual([]);
  await db.project.update({
    where: { id: project.id },
    data: { trashedAt: new Date() },
  });
  expect(
    (await getFinancialAttention(30, "2026-10-02", project.id, "archived"))
      .issues,
  ).toEqual([]);
});

it("keeps snoozes per employee and does not delete business records when an employee is removed", async () => {
  const db = memory.raw;
  const a = await db.user.create({
    data: { name: "A", email: "a@example.invalid" },
  });
  const b = await db.user.create({
    data: { name: "B", email: "b@example.invalid" },
  });
  const input = {
    issueKey: "term-due:00000000-0000-4000-8000-000000000001",
    fingerprint: "a".repeat(64),
    until: new Date("2026-10-01"),
    reason: "Awaiting confirmation",
  };
  await db.financialAttentionSnooze.createMany({
    data: [
      { ...input, userId: a.id },
      { ...input, userId: b.id },
    ],
  });
  await expect(
    db.financialAttentionSnooze.create({ data: { ...input, userId: a.id } }),
  ).rejects.toThrow();
  const before = await db.clientBillingDocument.count();
  await db.user.delete({ where: { id: a.id } });
  expect(
    await db.financialAttentionSnooze.count({ where: { userId: b.id } }),
  ).toBe(1);
  expect(await db.clientBillingDocument.count()).toBe(before);
});
