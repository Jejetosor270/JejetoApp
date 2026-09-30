import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";
import { saveTableCell } from "./listing-cell-edit";
import { createOrder, getOrder } from "./procurement/orders";
import { createOrderInputSchema } from "@/domain/procurement/validation";
let memory: Awaited<ReturnType<typeof prismaMemoryDatabase>>;
let actorId: string,
  userId: string,
  inactiveId: string,
  orderId: string,
  billingId: string,
  supplierId: string,
  projectId: string;
beforeAll(async () => {
  memory = await prismaMemoryDatabase();
  state.db = memory.active;
  const db = memory.raw;
  await db.currency.create({ data: { code: "EUR", name: "Euro" } });
  actorId = (
    await db.user.create({
      data: {
        email: "cell-manager@example.invalid",
        name: "Manager",
        role: "MANAGER",
      },
    })
  ).id;
  userId = (
    await db.user.create({
      data: {
        email: "cell-user@example.invalid",
        name: "Viewer",
        role: "USER",
      },
    })
  ).id;
  inactiveId = (
    await db.user.create({
      data: {
        email: "cell-inactive@example.invalid",
        name: "Inactive",
        role: "ADMIN",
        isActive: false,
      },
    })
  ).id;
  const client = await db.client.create({
    data: {
      displayName: "Client",
      legalName: "Client",
      defaultCurrencyCode: "EUR",
    },
  });
  projectId = (
    await db.project.create({
      data: {
        code: "CELL",
        name: "Project",
        clientId: client.id,
        reportingCurrencyCode: "EUR",
        defaultProductMarkupRate: "0.2",
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
  orderId = await createOrder(
    actorId,
    createOrderInputSchema.parse({
      projectId,
      supplierId,
      orderNumber: "CELL-01",
      packageName: "Test",
      buildingIds: [],
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
      pricingMode: "PROJECT_MARKUP",
      purchaseCost: "100",
      status: "DRAFT",
      freightTreatment: "NOT_APPLICABLE",
      inputVatTreatment: "DOMESTIC",
      inputVatRate: "20",
      inputVatTaxableBase: "100",
      inputVatRecoverability: "RECOVERABLE",
      outputVatTreatment: "DOMESTIC",
      outputVatRate: "20",
      invoiceDate: "2026-09-08",
    }),
  );
  billingId = (
    await db.clientBillingDocument.create({
      data: {
        reference: "INV-01",
        projectId,
        clientId: client.id,
        documentType: "INVOICE",
        documentDate: new Date("2026-09-08"),
        currencyCode: "EUR",
        totalHt: "200",
        totalTtc: "240",
        vatAmount: "40",
        vatRate: "0.2",
        isProjectRemainderApproved: true,
        allocations: {
          create: {
            orderId,
            basis: "PERCENTAGE",
            percentageRate: "0.5",
            allocatedAmount: "100",
          },
        },
      },
    })
  ).id;
}, 30000);
afterAll(async () => {
  await memory.close();
});

it("saves only the chosen field, audits it, rejects stale edits and invalid dates", async () => {
  for (const [kind, id] of [
    ["order", orderId],
    ["billing", billingId],
  ] as const) {
    const input = {
      kind,
      id,
      field: "shortDescription",
      previous: "",
      value: "Outdoor furniture",
    };
    await saveTableCell(actorId, input);
    const record =
      kind === "order"
        ? await memory.raw.procurementOrder.findUniqueOrThrow({ where: { id } })
        : await memory.raw.clientBillingDocument.findUniqueOrThrow({
            where: { id },
          });
    expect(record.shortDescription).toBe("Outdoor furniture");
    await expect(
      saveTableCell(actorId, { ...input, value: "Stale" }),
    ).rejects.toThrow("changed since");
    await expect(
      saveTableCell(actorId, {
        ...input,
        previous: "Outdoor furniture",
        value: "x".repeat(241),
      }),
    ).rejects.toThrow();
    await saveTableCell(actorId, {
      ...input,
      previous: "Outdoor furniture",
      value: "",
    });
  }
  await saveTableCell(actorId, {
    kind: "order",
    id: orderId,
    field: "invoiceDate",
    previous: "2026-09-08",
    value: "2026-09-09",
  });
  expect((await getOrder(orderId))?.invoiceDate).toBe("2026-09-09");
  expect((await getOrder(orderId))?.orderNumber).toBe("CELL-01");
  await expect(
    saveTableCell(actorId, {
      kind: "order",
      id: orderId,
      field: "invoiceDate",
      previous: "2026-09-08",
      value: "2026-09-10",
    }),
  ).rejects.toThrow("changed");
  await expect(
    saveTableCell(actorId, {
      kind: "billing",
      id: billingId,
      field: "documentDate",
      previous: "2026-09-08",
      value: "2026-02-30",
    }),
  ).rejects.toThrow("date");
  expect(
    await memory.raw.auditEvent.count({
      where: { entityId: orderId, summary: "Edited an Order table cell." },
    }),
  ).toBe(3);
});
it("recalculates purchase-based selling and output VAT without rescheduling or changing input VAT", async () => {
  const before = await getOrder(orderId);
  await saveTableCell(actorId, {
    kind: "order",
    id: orderId,
    field: "purchaseCost",
    previous: "100",
    value: "200,25",
  });
  const after = await getOrder(orderId);
  expect(after?.costs.purchaseCost).toBe("200.25");
  expect(after?.costs.reportingSellingRevenue).toBe("240.3");
  expect(after?.costs.outputVat?.amount).toBe("48.06");
  expect(after?.costs.inputVat).toEqual(before?.costs.inputVat);
  expect(after?.supplierPayment.scheduled).toBe(
    before?.supplierPayment.scheduled,
  );
  expect(after?.invoiceDate).toBe("2026-09-09");
});
it("updates Billing HT through the existing VAT, percentage-allocation and collection safeguards", async () => {
  await saveTableCell(actorId, {
    kind: "billing",
    id: billingId,
    field: "totalHt",
    previous: "200",
    value: "201,25",
  });
  const doc = await memory.raw.clientBillingDocument.findUniqueOrThrow({
    where: { id: billingId },
    include: { allocations: true },
  });
  expect(doc.totalHt.toString()).toBe("201.25");
  expect(doc.vatAmount.toString()).toBe("40");
  expect(doc.totalTtc.toString()).toBe("241.25");
  expect(doc.allocations[0]?.allocatedAmount.toString()).toBe("100.625");
  await memory.raw.clientReceipt.create({
    data: {
      billingDocumentId: billingId,
      amount: "100",
      receivedAt: new Date("2026-09-09"),
    },
  });
  await expect(
    saveTableCell(actorId, {
      kind: "billing",
      id: billingId,
      field: "totalHt",
      previous: "201.25",
      value: "10",
    }),
  ).rejects.toThrow("receipts");
  expect(
    (
      await memory.raw.clientBillingDocument.findUniqueOrThrow({
        where: { id: billingId },
      })
    ).totalHt.toString(),
  ).toBe("201.25");
});
it("rejects unauthorized actors and unsupported fields", async () => {
  const input = {
    kind: "order",
    id: orderId,
    field: "orderNumber",
    previous: "CELL-01",
    value: "HACK",
  };
  for (const actor of [userId, inactiveId])
    await expect(saveTableCell(actor, input)).rejects.toThrow("active");
  await expect(
    saveTableCell(actorId, { ...input, field: "paid" }),
  ).rejects.toThrow();
  expect((await getOrder(orderId))?.orderNumber).toBe("CELL-01");
});
it("preserves relationship safeguards and rejects cross-project Packages", async () => {
  const otherSupplier = await memory.raw.supplier.create({
    data: {
      displayName: "Other",
      legalName: "Other",
      defaultCurrencyCode: "EUR",
    },
  });
  await expect(
    saveTableCell(actorId, {
      kind: "order",
      id: orderId,
      field: "supplierId",
      previous: supplierId,
      value: otherSupplier.id,
    }),
  ).rejects.toThrow("payment terms");
  const project = await memory.raw.project.create({
    data: { code: "OTHER", name: "Other", reportingCurrencyCode: "EUR" },
  });
  const pack = await memory.raw.orderPackage.create({
    data: { projectId: project.id, name: "Other" },
  });
  await expect(
    saveTableCell(actorId, {
      kind: "order",
      id: orderId,
      field: "packageId",
      previous: "",
      value: pack.id,
    }),
  ).rejects.toThrow("Package");
  await expect(
    saveTableCell(actorId, {
      kind: "order",
      id: orderId,
      field: "projectId",
      previous: projectId,
      value: project.id,
    }),
  ).rejects.toThrow("Reconcile");
});
it("rejects edits to trashed records", async () => {
  const record = await memory.raw.procurementOrder.create({
    data: {
      orderNumber: "TRASH-CELL",
      packageName: "Trash",
      projectId,
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
      trashedAt: new Date(),
    },
  });
  await expect(
    saveTableCell(actorId, {
      kind: "order",
      id: record.id,
      field: "orderNumber",
      previous: "TRASH-CELL",
      value: "NEW",
    }),
  ).rejects.toThrow();
});

async function isolatedOrder(orderNumber: string) {
  return memory.raw.procurementOrder.create({
    data: {
      orderNumber,
      packageName: "Cell regression",
      projectId,
      supplierId,
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
      status: "DRAFT",
    },
  });
}

it("preserves carrier validation, normalization and audited clearing", async () => {
  const order = await isolatedOrder("CARRIER-CELL");
  const edit = (field: string, previous: string, value: string) =>
    saveTableCell(actorId, {
      kind: "order",
      id: order.id,
      field,
      previous,
      value,
    });
  await expect(edit("carrierCode", "", "INVALID")).rejects.toThrow(
    "valid carrier",
  );
  await expect(edit("carrierCode", "", "OTHER")).rejects.toThrow(
    "Delivery editor",
  );
  await expect(edit("carrierOtherName", "", "Custom")).rejects.toThrow(
    "Select Other",
  );
  await memory.raw.procurementOrder.update({
    where: { id: order.id },
    data: { carrierCode: "OTHER", carrierOtherName: "Original" },
  });
  await expect(edit("carrierOtherName", "Original", " ")).rejects.toThrow(
    "carrier name",
  );
  await edit("carrierOtherName", "Original", "  New carrier  ");
  await edit("carrierCode", "OTHER", "");
  await edit("trackingReference", "", "  TRACK-1  ");
  await edit("trackingReference", "TRACK-1", " ");
  const saved = await memory.raw.procurementOrder.findUniqueOrThrow({
    where: { id: order.id },
  });
  expect(saved).toMatchObject({
    carrierCode: null,
    carrierOtherName: null,
    trackingReference: null,
    updatedById: actorId,
  });
  const audits = await memory.raw.auditEvent.findMany({
    where: { entityId: order.id },
  });
  expect(audits).toHaveLength(4);
  expect(audits.map((audit) => audit.metadata)).toContainEqual({
    field: "trackingReference",
    previous: "TRACK-1",
    value: null,
  });
});

it("reschedules only the earliest unpaid Supplier term and rejects stale or invalid dates", async () => {
  const order = await isolatedOrder("DUE-CELL");
  const terms = await Promise.all(
    [1, 2, 3].map((sequence) =>
      memory.raw.paymentInstallment.create({
        data: {
          orderId: order.id,
          direction: "SUPPLIER_PAYMENT",
          sequence,
          label: `Term ${sequence}`,
          basis: "FIXED_AMOUNT",
          scheduledAmount: "100",
          currencyCode: "EUR",
          dueDate: new Date(`2026-10-0${sequence}`),
        },
      }),
    ),
  );
  const [paid, next, later] = terms;
  if (!paid || !next || !later) throw new Error("Missing fixture terms");
  await memory.raw.paymentSettlement.create({
    data: {
      installmentId: paid.id,
      amount: "100",
      settledAt: new Date("2026-10-01"),
    },
  });
  const input = {
    kind: "order",
    id: order.id,
    field: "dueDate",
    previous: "2026-10-02",
    value: "2026-10-04",
  };
  await expect(
    saveTableCell(actorId, { ...input, value: "2026-02-30" }),
  ).rejects.toThrow("valid date");
  await saveTableCell(actorId, input);
  await expect(saveTableCell(actorId, input)).rejects.toThrow(
    "next unpaid term changed",
  );
  const saved = await memory.raw.paymentInstallment.findMany({
    where: { orderId: order.id },
    orderBy: { sequence: "asc" },
  });
  expect(saved.map((term) => term.dueDate?.toISOString().slice(0, 10))).toEqual(
    ["2026-10-01", "2026-10-04", "2026-10-03"],
  );
  expect(saved.map((term) => term.scheduledAmount.toString())).toEqual([
    "100",
    "100",
    "100",
  ]);
  expect(
    await memory.raw.auditEvent.count({
      where: {
        entityId: order.id,
        summary: "Rescheduled the next unpaid Supplier term.",
      },
    }),
  ).toBe(1);
});

it("rejects cancellation through a cell and blocks edits to cancelled Orders", async () => {
  const order = await isolatedOrder("CANCEL-CELL");
  await expect(
    saveTableCell(actorId, {
      kind: "order",
      id: order.id,
      field: "status",
      previous: "DRAFT",
      value: "CANCELLED",
    }),
  ).rejects.toThrow("Cancel Order in Details");
  await memory.raw.procurementOrder.update({
    where: { id: order.id },
    data: { status: "CANCELLED" },
  });
  await expect(
    saveTableCell(actorId, {
      kind: "order",
      id: order.id,
      field: "shortDescription",
      previous: "",
      value: "Changed",
    }),
  ).rejects.toThrow("cancelled");
  expect(
    await memory.raw.auditEvent.count({ where: { entityId: order.id } }),
  ).toBe(0);
});
