import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { orderSortFields } from "@/config/order-list";
import {
  createOrderInputSchema,
  updateOrderInputSchema,
} from "@/domain/procurement/validation";
const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";
import { createOrder, getOrder, listOrdersPage, updateOrder } from "./orders";
let memory: Awaited<ReturnType<typeof prismaMemoryDatabase>>;
let projectId: string, supplierId: string, actorId: string;
const filters = {
  query: "",
  page: 1,
  pageSize: 25 as const,
  direction: "asc" as const,
};
beforeAll(async () => {
  memory = await prismaMemoryDatabase();
  state.db = memory.active;
  const db = memory.raw;
  await db.currency.create({ data: { code: "EUR", name: "Euro" } });
  projectId = (
    await db.project.create({
      data: { code: "SORT", name: "Sort test", reportingCurrencyCode: "EUR" },
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
  actorId = (
    await db.user.create({
      data: { name: "Manager", email: "sort@example.invalid", role: "MANAGER" },
    })
  ).id;
  for (let index = 1; index <= 27; index++) {
    await db.procurementOrder.create({
      data: {
        orderNumber: `SORT-${String(index).padStart(2, "0")}`,
        packageName: "Test",
        projectId,
        supplierId,
        orderCurrencyCode: "EUR",
        sellingCurrencyCode: "EUR",
        addedDate: new Date(`2026-10-${String(index).padStart(2, "0")}`),
        orderDate: new Date(`2026-09-${String(index).padStart(2, "0")}`),
        invoiceDate: new Date(`2026-09-${String(index).padStart(2, "0")}`),
        expectedDeliveryDate: new Date(
          `2026-10-${String(index).padStart(2, "0")}`,
        ),
        paymentStatusOverride: index === 1 ? "PAID" : null,
        costLines: {
          create: {
            category: "SUPPLIER_PURCHASE",
            originalAmount: String(28 - index),
          },
        },
        paymentInstallments: {
          create: {
            sequence: 1,
            direction: "SUPPLIER_PAYMENT",
            label: "Balance",
            basis: "FIXED_AMOUNT",
            scheduledAmount: String(28 - index),
            currencyCode: "EUR",
            dueDate: new Date(`2030-09-${String(index).padStart(2, "0")}`),
          },
        },
      },
    });
  }
  await db.procurementOrder.create({
    data: {
      orderNumber: "HIDDEN",
      packageName: "Hidden",
      projectId,
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
      trashedAt: new Date(),
    },
  });
}, 30000);
afterAll(async () => {
  await memory.close();
});

it("sorts derived purchase amounts over the entire filtered scope before pagination", async () => {
  const first = await listOrdersPage({
    ...filters,
    projectId,
    sort: "purchase",
  });
  const second = await listOrdersPage({
    ...filters,
    projectId,
    sort: "purchase",
    page: 2,
  });
  expect(first.total).toBe(27);
  expect(first.items[0]?.orderNumber).toBe("SORT-27");
  expect(second.items.map((row) => row.orderNumber)).toEqual([
    "SORT-02",
    "SORT-01",
  ]);
  const descending = await listOrdersPage({
    ...filters,
    projectId,
    sort: "purchase",
    direction: "desc",
  });
  expect(descending.items[0]?.orderNumber).toBe("SORT-01");
});

it("sorts every advertised column, preserves filters and excludes Trash", async () => {
  for (const sort of orderSortFields) {
    const result = await listOrdersPage({
      ...filters,
      projectId,
      query: "SORT-02",
      sort,
    });
    expect(result.items.map((row) => row.orderNumber)).toEqual(["SORT-02"]);
    expect(result.total).toBe(1);
  }
});

it("filters by Added date and ignores retired Package filters", async () => {
  const result = await listOrdersPage({
    ...filters,
    projectId,
    sort: "addedDate",
    direction: "desc",
    dateFrom: "2026-10-02",
    dateTo: "2026-10-03",
    packageId: "00000000-0000-4000-8000-000000000000",
  });
  expect(result.items.map((row) => [row.orderNumber, row.addedDate])).toEqual([
    ["SORT-03", "2026-10-03"],
    ["SORT-02", "2026-10-02"],
  ]);
  expect(result.total).toBe(2);
  const originalDates = await listOrdersPage({
    ...filters,
    projectId,
    sort: "addedDate",
    direction: "desc",
    dateField: "orderDate",
    dateFrom: "2026-09-02",
    dateTo: "2026-09-03",
  });
  expect(originalDates.items.map((row) => row.orderNumber)).toEqual([
    "SORT-03",
    "SORT-02",
  ]);
  const addedDates = await listOrdersPage({
    ...filters,
    projectId,
    sort: "addedDate",
    dateFrom: "2026-09-02",
    dateTo: "2026-09-03",
  });
  expect(addedDates.total).toBe(0);
});

it("defaults creation to Paris today and preserves Added date through edits", async () => {
  const addedProject = await memory.raw.project.create({
    data: {
      code: "ADDED",
      name: "Added date test",
      reportingCurrencyCode: "EUR",
    },
  });
  const base = {
    projectId: addedProject.id,
    supplierId,
    orderNumber: "ADDED-DATE",
    packageName: "Dates",
    orderCurrencyCode: "EUR",
    sellingCurrencyCode: "EUR",
    purchaseCost: "100",
    pricingMode: "PROJECT_MARKUP",
    freightTreatment: "NOT_APPLICABLE",
    status: "DRAFT",
    buildingIds: [],
  };
  let id: string;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-07-01T22:30:00Z"));
  try {
    id = await createOrder(actorId, createOrderInputSchema.parse(base));
  } finally {
    vi.useRealTimers();
  }
  const original = await memory.raw.procurementOrder.findUniqueOrThrow({
    where: { id },
  });
  expect((await getOrder(id))?.addedDate).toBe("2026-07-02");
  await updateOrder(
    actorId,
    updateOrderInputSchema.parse({ ...base, id, invoiceDate: "2026-06-29" }),
  );
  expect((await getOrder(id))?.addedDate).toBe("2026-07-02");
  const opening = await getOrder(id);
  await updateOrder(
    actorId,
    updateOrderInputSchema.parse({
      ...base,
      id,
      addedDate: "2026-07-03",
      expectedVersion: opening?.editVersion,
    }),
  );
  expect((await getOrder(id))?.addedDate).toBe("2026-07-03");
  await expect(
    updateOrder(
      actorId,
      updateOrderInputSchema.parse({
        ...base,
        id,
        addedDate: "2026-07-04",
        expectedVersion: opening?.editVersion,
      }),
    ),
  ).rejects.toThrow("Changed since editing began");
  const edited = await memory.raw.procurementOrder.findUniqueOrThrow({
    where: { id },
  });
  expect(edited.createdAt).toEqual(original.createdAt);
  expect(edited.invoiceDate).toEqual(new Date("2026-06-29"));
  expect(
    (await memory.raw.auditEvent.findMany({ where: { entityId: id } })).map(
      (event) => event.metadata,
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ addedDate: "2026-07-02" }),
      expect.objectContaining({ addedDate: "2026-07-03" }),
    ]),
  );
});

it("sorts dates and derived payment statuses, ignoring legacy overrides", async () => {
  for (const sort of [
    "addedDate",
    "invoiceDate",
    "dueDate",
    "expectedDelivery",
  ] as const) {
    const result = await listOrdersPage({
      ...filters,
      projectId,
      sort,
      direction: "desc",
    });
    expect(result.items[0]?.orderNumber).toBe("SORT-27");
  }
  const result = await listOrdersPage({
    ...filters,
    projectId,
    sort: "paymentStatus",
  });
  // All fixtures are unpaid: equal statuses must use IDs, regardless of the legacy override.
  const expected = await memory.raw.procurementOrder.findMany({
    where: { projectId, trashedAt: null },
    orderBy: { id: "asc" },
    select: { id: true },
    take: filters.pageSize,
  });
  expect(result.items.map((row) => row.id)).toEqual(
    expected.map((row) => row.id),
  );
  expect(result.items.every((row) => row.supplierPayment.paid === "0")).toBe(
    true,
  );
});

it("uses the earliest unpaid installment, ignoring settled and cancelled installments", async () => {
  const order = await memory.raw.procurementOrder.findUniqueOrThrow({
    where: { orderNumber: "SORT-01" },
  });
  const term = await memory.raw.paymentInstallment.findFirstOrThrow({
    where: { orderId: order.id },
  });
  await memory.raw.paymentSettlement.create({
    data: {
      installmentId: term.id,
      amount: term.scheduledAmount,
      settledAt: new Date("2026-09-09"),
    },
  });
  await memory.raw.paymentInstallment.create({
    data: {
      orderId: order.id,
      sequence: 2,
      direction: "SUPPLIER_PAYMENT",
      label: "Cancelled",
      basis: "FIXED_AMOUNT",
      scheduledAmount: "1",
      currencyCode: "EUR",
      dueDate: new Date("2026-01-01"),
      isCancelled: true,
    },
  });
  await memory.raw.paymentInstallment.create({
    data: {
      orderId: order.id,
      sequence: 3,
      direction: "SUPPLIER_PAYMENT",
      label: "Remaining",
      basis: "FIXED_AMOUNT",
      scheduledAmount: "1",
      currencyCode: "EUR",
      dueDate: new Date("2030-12-01"),
    },
  });
  expect((await getOrder(order.id))?.supplierPayment.nextDueDate).toBe(
    "2030-12-01",
  );
});

it("saves a distinct invoice date, preserves it when omitted, and clears it explicitly", async () => {
  const base = {
    projectId,
    supplierId,
    orderNumber: "DATE-EDIT",
    packageName: "Dates",
    orderCurrencyCode: "EUR",
    sellingCurrencyCode: "EUR",
    purchaseCost: "100",
    pricingMode: "PROJECT_MARKUP",
    freightTreatment: "NOT_APPLICABLE",
    status: "DRAFT",
    buildingIds: [],
  };
  const id = await createOrder(
    actorId,
    createOrderInputSchema.parse({
      ...base,
      orderDate: "2026-09-01",
      quoteDate: "2026-08-01",
      invoiceDate: "2026-09-08",
    }),
  );
  expect((await getOrder(id))?.invoiceDate).toBe("2026-09-08");
  await updateOrder(actorId, updateOrderInputSchema.parse({ ...base, id }));
  expect((await getOrder(id))?.invoiceDate).toBe("2026-09-08");
  await updateOrder(
    actorId,
    updateOrderInputSchema.parse({ ...base, id, invoiceDate: "" }),
  );
  expect((await getOrder(id))?.invoiceDate).toBeNull();
});

it("shows the final Supplier cash date only once fully paid and restores due dates after correction", async () => {
  const db = memory.raw;
  const order = await db.procurementOrder.findUniqueOrThrow({
    where: { orderNumber: "SORT-02" },
  });
  const term = await db.paymentInstallment.findFirstOrThrow({
    where: { orderId: order.id },
  });
  await db.paymentSettlement.create({
    data: {
      installmentId: term.id,
      amount: "10",
      settledAt: new Date("2026-09-10"),
    },
  });
  expect((await getOrder(order.id))?.supplierPayment).toMatchObject({
    paidAt: null,
    nextDueDate: "2030-09-02",
    status: "PARTIALLY_PAID",
  });
  const final = await db.paymentSettlement.create({
    data: {
      installmentId: term.id,
      amount: "16",
      settledAt: new Date("2026-09-26"),
    },
  });
  // Legacy client planning cash is not a Supplier payment date.
  await db.paymentInstallment.create({
    data: {
      orderId: order.id,
      sequence: 1,
      direction: "CLIENT_RECEIPT",
      label: "Legacy client cash",
      basis: "FIXED_AMOUNT",
      scheduledAmount: "1",
      currencyCode: "EUR",
      settlements: {
        create: { amount: "1", settledAt: new Date("2099-01-01") },
      },
    },
  });
  expect((await getOrder(order.id))?.supplierPayment).toMatchObject({
    paidAt: "2026-09-26",
    nextDueDate: null,
    status: "PAID",
  });
  expect(
    (await db.paymentInstallment.findUniqueOrThrow({ where: { id: term.id } }))
      .dueDate,
  ).toEqual(new Date("2030-09-02"));
  await db.paymentSettlement.delete({ where: { id: final.id } });
  expect((await getOrder(order.id))?.supplierPayment).toMatchObject({
    paidAt: null,
    nextDueDate: "2030-09-02",
    status: "PARTIALLY_PAID",
  });
});
