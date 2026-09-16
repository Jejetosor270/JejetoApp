import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";
import { payTermRemaining } from "./payments/term-paid";
import {
  getClientBillingDocument,
  listClientBillingPage,
  listProjectBillingDocuments,
  updateClientBillingDocument,
  updateOrderBillingLink,
} from "./billing/billing";
import { billingDocumentEditSchema } from "@/domain/billing/validation";
import { billingDueDateContext, editBillingDueDate } from "./billing/due-date";
import { listClientCashInstallments } from "./billing/reporting";
import {
  getOrderPaymentSummary,
  getProjectPaymentSummaries,
} from "./payments/payments";
import { createOrder, getOrder, updateOrder } from "./procurement/orders";
import {
  createOrderInputSchema,
  updateOrderInputSchema,
} from "@/domain/procurement/validation";
let memory: Awaited<ReturnType<typeof prismaMemoryDatabase>>;
let actorId: string, projectId: string, clientId: string, supplierId: string;
beforeAll(async () => {
  memory = await prismaMemoryDatabase();
  state.db = memory.active;
  const db = memory.raw;
  await db.currency.createMany({
    data: [
      { code: "EUR", name: "Euro" },
      { code: "USD", name: "Dollar" },
    ],
  });
  actorId = (
    await db.user.create({
      data: {
        name: "Manager",
        email: "review@example.invalid",
        role: "MANAGER",
      },
    })
  ).id;
  clientId = (
    await db.client.create({
      data: {
        displayName: "Client",
        legalName: "Client",
        defaultCurrencyCode: "EUR",
      },
    })
  ).id;
  supplierId = (
    await db.supplier.create({
      data: {
        displayName: "Supplier",
        legalName: "Supplier",
        defaultCurrencyCode: "EUR",
      },
    })
  ).id;
  projectId = (
    await db.project.create({
      data: {
        code: "REVIEW",
        name: "Review",
        reportingCurrencyCode: "EUR",
        clientId,
      },
    })
  ).id;
}, 30000);
afterAll(async () => {
  await memory.close();
});

it("batches Project Billing and supplier terms without per-record detail reads and preserves their results", async () => {
  for (const index of [1, 2, 3]) {
    await createOrder(
      actorId,
      createOrderInputSchema.parse({
        projectId,
        supplierId,
        orderNumber: `BATCH-${index}`,
        packageName: "Batch",
        orderCurrencyCode: "EUR",
        sellingCurrencyCode: "EUR",
        purchaseCost: "100",
        pricingMode: "PROJECT_MARKUP",
        freightTreatment: "NOT_APPLICABLE",
        status: "DRAFT",
        buildingIds: [],
      }),
    );
  }
  await memory.raw.clientBillingDocument.createMany({
    data: Array.from({ length: 25 }, (_, index) => ({
      projectId,
      clientId,
      currencyCode: "EUR",
      documentType: "INVOICE" as const,
      workflowStatus: "INVOICED" as const,
      reference: `BATCH-${index}`,
      documentDate: new Date("2026-09-01"),
      totalHt: "100",
      vatAmount: "20",
      totalTtc: "120",
    })),
  });
  const billingSingle = vi.spyOn(
    memory.active.clientBillingDocument,
    "findUnique",
  );
  const billingBatch = vi.spyOn(
    memory.active.clientBillingDocument,
    "findMany",
  );
  const orderSingle = vi.spyOn(memory.active.procurementOrder, "findUnique");
  const termBatch = vi.spyOn(memory.active.paymentInstallment, "findMany");
  try {
    const documents = await listProjectBillingDocuments(projectId);
    const supplier = await getProjectPaymentSummaries(projectId);
    expect(documents.length).toBeGreaterThanOrEqual(25);
    expect(supplier).toHaveLength(3);
    expect(billingSingle).not.toHaveBeenCalled();
    expect(orderSingle).not.toHaveBeenCalled();
    expect(billingBatch).toHaveBeenCalledTimes(1);
    expect(termBatch).toHaveBeenCalledTimes(1);
    for (const document of documents) {
      expect(document).toEqual(await getClientBillingDocument(document.id));
    }
    for (const { order, summary } of supplier) {
      expect(summary).toEqual(
        (await getOrderPaymentSummary(order.id)).supplier,
      );
    }
  } finally {
    vi.restoreAllMocks();
  }
});

it("settles only a Client term's remaining cash atomically, preserves history and requires actual FX", async () => {
  const db = memory.raw;
  const doc = await db.clientBillingDocument.create({
    data: {
      projectId,
      clientId,
      currencyCode: "USD",
      documentType: "INVOICE",
      workflowStatus: "INVOICED",
      reference: "FX",
      documentDate: new Date("2026-09-01"),
      totalHt: "100",
      vatAmount: "20",
      totalTtc: "120",
    },
  });
  const term = await db.clientPaymentInstallment.create({
    data: {
      billingDocumentId: doc.id,
      label: "Balance",
      sequence: 1,
      basis: "FIXED_AMOUNT",
      scheduledAmount: "120",
      currencyCode: "USD",
    },
  });
  await db.clientReceipt.create({
    data: {
      billingDocumentId: doc.id,
      installmentId: term.id,
      amount: "20",
      fxRateToReporting: "0.8",
      receivedAt: new Date("2026-09-01"),
    },
  });
  await expect(
    payTermRemaining(actorId, {
      kind: "client",
      id: term.id,
      documentId: doc.id,
    }),
  ).rejects.toThrow("FX");
  expect(
    await db.clientReceipt.count({ where: { installmentId: term.id } }),
  ).toBe(1);
  await payTermRemaining(actorId, {
    kind: "client",
    id: term.id,
    documentId: doc.id,
    fxRate: "0.9",
    date: "2026-09-16",
  });
  await payTermRemaining(actorId, {
    kind: "client",
    id: term.id,
    documentId: doc.id,
    fxRate: "0.9",
  });
  const receipts = await db.clientReceipt.findMany({
    where: { installmentId: term.id },
    orderBy: { amount: "asc" },
  });
  expect(receipts.map((r) => r.amount.toString())).toEqual(["20", "100"]);
  expect(receipts[1]?.fxRateToReporting?.toString()).toBe("0.9");
  expect((await getClientBillingDocument(doc.id))?.status).toBe("PAID");
});

it("uses one effective due date in list/calendar and edits only the earliest unpaid term", async () => {
  const db = memory.raw;
  const doc = await db.clientBillingDocument.create({
    data: {
      projectId,
      clientId,
      currencyCode: "EUR",
      documentType: "INVOICE",
      workflowStatus: "INVOICED",
      reference: "DATES",
      documentDate: new Date("2026-09-01"),
      dueDate: new Date("2099-01-01"),
      totalHt: "100",
      totalTtc: "100",
    },
  });
  const term = await db.clientPaymentInstallment.create({
    data: {
      billingDocumentId: doc.id,
      label: "First",
      sequence: 1,
      basis: "FIXED_AMOUNT",
      scheduledAmount: "50",
      currencyCode: "EUR",
    },
  });
  const second = await db.clientPaymentInstallment.create({
    data: {
      billingDocumentId: doc.id,
      label: "Second",
      sequence: 2,
      basis: "FIXED_AMOUNT",
      scheduledAmount: "50",
      currencyCode: "EUR",
      dueDate: new Date("2099-03-01"),
    },
  });
  expect((await billingDueDateContext(memory.active, doc.id)).term?.id).toBe(
    term.id,
  );
  await memory.active.$transaction((tx) =>
    editBillingDueDate(tx, actorId, doc.id, "2099-02-01"),
  );
  expect((await getClientBillingDocument(doc.id))?.dueDate).toBe("2099-02-01");
  expect(
    (await listClientCashInstallments([projectId])).find(
      (t) => t.id === term.id,
    )?.dueDate,
  ).toBe("2099-02-01");
  expect(
    (
      await db.clientPaymentInstallment.findUniqueOrThrow({
        where: { id: second.id },
      })
    ).dueDate
      ?.toISOString()
      .slice(0, 10),
  ).toBe("2099-03-01");
  expect(
    (
      await db.clientBillingDocument.findUniqueOrThrow({
        where: { id: doc.id },
      })
    ).dueDate
      ?.toISOString()
      .slice(0, 10),
  ).toBe("2099-01-01");
  const original = await getClientBillingDocument(doc.id);
  if (!original) throw new Error("Fixture missing");
  await db.clientPaymentInstallment.update({
    where: { id: term.id },
    data: { label: "Changed concurrently" },
  });
  const input = billingDocumentEditSchema.parse({
    ...original,
    allocations: [],
    vatTreatment: undefined,
    vatRate: undefined,
    fxRate: undefined,
    shortDescription: undefined,
    notes: undefined,
    expectedVersion: original.editVersion,
    expectedFields: original.editFields,
  });
  await expect(updateClientBillingDocument(actorId, input)).rejects.toThrow(
    "payment Installments",
  );
  const listing = await listClientBillingPage({
    projectId,
    status: "PAID",
    sort: "paid",
    direction: "desc",
    page: 1,
    pageSize: 25,
    query: "",
  });
  expect(listing.items.map((r) => r.reference)).toEqual(["FX"]);
});

it("rejects stale Order and allocation editors after dependency changes", async () => {
  const base = {
    projectId,
    supplierId,
    orderNumber: "STALE",
    packageName: "Stale",
    orderCurrencyCode: "EUR",
    sellingCurrencyCode: "EUR",
    purchaseCost: "100",
    pricingMode: "PROJECT_MARKUP",
    freightTreatment: "NOT_APPLICABLE",
    status: "DRAFT",
    buildingIds: [],
  };
  const id = await createOrder(actorId, createOrderInputSchema.parse(base));
  const original = await getOrder(id);
  if (!original) throw new Error("Fixture missing");
  await memory.raw.project.update({
    where: { id: projectId },
    data: { defaultProductMarkupRate: "0.25" },
  });
  await expect(
    updateOrder(
      actorId,
      updateOrderInputSchema.parse({
        ...base,
        id,
        expectedVersion: original.editVersion,
        expectedFields: original.editFields,
      }),
    ),
  ).rejects.toThrow("project");
  const doc = await memory.raw.clientBillingDocument.findFirstOrThrow({
    where: { reference: "DATES" },
  });
  const view = await getClientBillingDocument(doc.id);
  if (!view) throw new Error("Fixture missing");
  await memory.raw.clientBillingDocument.update({
    where: { id: doc.id },
    data: { reference: "NEW REF" },
  });
  await expect(
    updateOrderBillingLink(actorId, {
      billingDocumentId: doc.id,
      orderId: id,
      basis: "FIXED_AMOUNT",
      allocatedAmount: "10",
      isProjectRemainderApproved: false,
      remove: false,
      expectedVersion: view.editVersion,
      expectedFields: view.editFields,
    }),
  ).rejects.toThrow("reference");
  expect(
    await memory.raw.clientBillingAllocation.count({
      where: { billingDocumentId: doc.id },
    }),
  ).toBe(0);
});
