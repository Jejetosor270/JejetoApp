import { clientBillingConfirmationSchema } from "@/domain/billing/validation";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";
import { changeBillingStatus } from "./status";
import {
  confirmClientBillingDocument,
  getClientBillingDocument,
  recordClientReceipt,
  deleteClientReceipt,
} from "./billing";
import {
  getProjectClientBillingSummary,
  listClientCashInstallments,
} from "./reporting";
import { getBilledFreight } from "./freight-reporting";
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

it("creates paid billing and its automatic full term atomically after employee confirmation", async () => {
  const db = memory.raw;
  const actor = await db.user.create({
    data: {
      name: "Creator",
      email: "creator@example.invalid",
      role: "MANAGER",
    },
  });
  const client = await db.client.create({
    data: {
      displayName: "Test client",
      legalName: "Test client",
      defaultCurrencyCode: "EUR",
    },
  });
  const project = await db.project.create({
    data: {
      clientId: client.id,
      code: "PAID-CREATE",
      name: "Paid create",
      reportingCurrencyCode: "EUR",
    },
  });
  const input = clientBillingConfirmationSchema.parse({
    action: "CREATE",
    allocations: [],
    clientId: client.id,
    projectId: project.id,
    documentType: "INVOICE",
    documentDate: "2026-09-11",
    duplicateWarning: false,
    installments: [],
    isCancelled: false,
    isProjectRemainderApproved: false,
    originalFilename: "Manual entry",
    provider: "manual",
    model: "manual",
    reference: "PAID-CREATE",
    replaceSchedule: false,
    totalHt: "100",
    vatAmount: "20",
    totalTtc: "120",
    currencyCode: "EUR",
    workflowStatus: "PAID",
    paymentDate: "2026-09-10",
  });
  const id = await confirmClientBillingDocument(actor.id, input);
  const saved = await getClientBillingDocument(id);
  expect(saved?.status).toBe("PAID");
  expect(saved?.paymentInstallments).toHaveLength(1);
  expect(saved?.paymentInstallments[0]?.receipts[0]?.amount).toBe("120");
  expect(saved?.receipts[0]?.receivedAt).toBe("2026-09-10");
  await expect(
    confirmClientBillingDocument(actor.id, {
      ...input,
      reference: "INVALID-PAID",
      paymentDate: undefined,
    }),
  ).rejects.toThrow();
  expect(
    await db.clientBillingDocument.count({
      where: { reference: "INVALID-PAID" },
    }),
  ).toBe(0);
}, 30000);

it("excludes pre-invoice billing, records confirmed Paid across terms, and reopens after a correction", async () => {
  const db = memory.raw;
  const actor = await db.user.create({
    data: { name: "Manager", email: "status@example.invalid", role: "MANAGER" },
  });
  const project = await db.project.create({
    data: { code: "STATUS", name: "Status", reportingCurrencyCode: "EUR" },
  });
  const invoice = await db.clientBillingDocument.create({
    data: {
      reference: "S-1",
      projectId: project.id,
      documentType: "INVOICE",
      documentDate: new Date("2026-01-01"),
      currencyCode: "USD",
      totalHt: "100",
      vatAmount: "20",
      totalTtc: "120",
      freightCoverageHt: "10",
      fxRateToReporting: "0.8",
      workflowStatus: "DRAFT",
    },
  });
  for (const [sequence, amount] of [
    [1, "40"],
    [2, "80"],
  ] as const)
    await db.clientPaymentInstallment.create({
      data: {
        billingDocumentId: invoice.id,
        sequence,
        label: `Term ${sequence}`,
        basis: "FIXED_AMOUNT",
        scheduledAmount: amount,
        currencyCode: "USD",
        dueDate: new Date("2026-01-02"),
        expectedFxRateToReporting: "0.8",
      },
    });
  for (const value of ["DRAFT", "TO_BE_INVOICED"]) {
    await changeBillingStatus(actor.id, { id: invoice.id, value });
    expect((await getClientBillingDocument(invoice.id))?.status).toBe(value);
    expect((await getProjectClientBillingSummary(project.id))?.invoicedHt).toBe(
      "0.0000",
    );
    expect(await listClientCashInstallments([project.id])).toEqual([]);
    expect(
      (await getBilledFreight({ projectId: project.id }, "EUR"))
        .invoicedFreightHt,
    ).toBe("0.0000");
  }
  await expect(
    recordClientReceipt(actor.id, {
      billingDocumentId: invoice.id,
      installmentId: null,
      amount: "1",
      receivedAt: "2026-09-11",
    }),
  ).rejects.toThrow("active Invoice");
  await expect(
    changeBillingStatus(actor.id, {
      id: invoice.id,
      value: "PAID",
      confirmedAmount: "119",
      paymentDate: "2026-09-11",
      paymentFx: "0.9",
    }),
  ).rejects.toThrow("remaining amount changed");
  await expect(
    changeBillingStatus(actor.id, {
      id: invoice.id,
      value: "PAID",
      confirmedAmount: "120",
      paymentDate: "2026-09-11",
    }),
  ).rejects.toThrow("FX");
  expect((await getClientBillingDocument(invoice.id))?.status).toBe(
    "TO_BE_INVOICED",
  );
  expect(
    await db.clientReceipt.count({ where: { billingDocumentId: invoice.id } }),
  ).toBe(0);
  await changeBillingStatus(actor.id, {
    id: invoice.id,
    value: "PAID",
    confirmedAmount: "120",
    paymentDate: "2026-09-11",
    paymentFx: "0.9",
  });
  const saved = await getClientBillingDocument(invoice.id);
  expect(saved?.status).toBe("PAID");
  expect(saved?.paid).toBe("120.0000");
  expect(saved?.receipts.map((r) => r.amount)).toEqual(["40", "80"]);
  const summary = await getProjectClientBillingSummary(project.id);
  expect(summary?.invoicedHt).toBe("80.0000");
  expect(summary?.paidTtc).toBe("108.0000");
  expect(
    (await listClientCashInstallments([project.id])).map(
      (t) => t.outstandingAmount,
    ),
  ).toEqual(["0", "0"]);
  await expect(
    changeBillingStatus(actor.id, { id: invoice.id, value: "DRAFT" }),
  ).rejects.toThrow("Correct recorded payments");
  const firstReceipt = saved?.receipts[0];
  if (!firstReceipt) throw new Error("Missing receipt");
  await deleteClientReceipt(actor.id, {
    id: firstReceipt.id,
    billingDocumentId: invoice.id,
  });
  expect((await getClientBillingDocument(invoice.id))?.status).toBe("OVERDUE");
  expect((await getClientBillingDocument(invoice.id))?.outstanding).toBe(
    "40.0000",
  );
  const viewer = await db.user.create({
    data: { name: "Viewer", email: "viewer@example.invalid", role: "USER" },
  });
  await expect(
    changeBillingStatus(viewer.id, { id: invoice.id, value: "INVOICED" }),
  ).rejects.toThrow("Administrator or Manager");
}, 30000);
