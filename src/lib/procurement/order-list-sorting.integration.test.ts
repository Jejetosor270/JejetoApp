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

it("sorts dates and displayed manual payment statuses", async () => {
  for (const sort of ["invoiceDate", "dueDate", "expectedDelivery"] as const) {
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
  expect(result.items[0]?.orderNumber).toBe("SORT-01");
  expect(result.items[0]?.paymentStatusOverride).toBe("PAID");
  expect(result.items[0]?.supplierPayment.paid).toBe("0");
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
