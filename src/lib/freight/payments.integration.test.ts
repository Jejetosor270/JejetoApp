import { beforeAll, afterAll, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";
import {
  saveFreightPayment,
  removeFreightPayment,
  unassignFreightPayments,
} from "./payments";
import { updateProjectFreightExpense } from "./expenses";
import { restoreTrash } from "@/lib/trash/service";
import { getProjectControl } from "@/lib/reporting/project-control";
import { getProjectReportingSnapshot } from "@/lib/reporting/reports";
import { getActualCashReport } from "@/lib/reporting/global-reports";
let memory: Awaited<ReturnType<typeof prismaMemoryDatabase>>;
let actorId: string, projectId: string, expenseId: string;
beforeAll(async () => {
  memory = await prismaMemoryDatabase();
  state.db = memory.active;
  await memory.raw.currency.create({ data: { code: "EUR", name: "Euro" } });
  actorId = (
    await memory.raw.user.create({
      data: { name: "Test", email: "freight@example.invalid", role: "ADMIN" },
    })
  ).id;
  projectId = (
    await memory.raw.project.create({
      data: {
        name: "Test",
        code: "F",
        reportingCurrencyCode: "EUR",
        estimatedPurchaseCostHt: "1000",
        estimatedFreightCostHt: "100",
        freightEstimateRate: "0.15",
      },
    })
  ).id;
  expenseId = (
    await memory.raw.projectFreightExpense.create({
      data: {
        projectId,
        currencyCode: "EUR",
        description: "Transport",
        expenseDate: new Date("2026-09-01"),
        dueDate: new Date("2026-09-01"),
        costAmountHt: "100",
        vatAmount: "20",
        vatTreatment: "DOMESTIC",
        recoverableRate: "1",
        recoverability: "RECOVERABLE",
      },
    })
  ).id;
}, 30000);
afterAll(async () => {
  await memory.close();
});
it("records, corrects and trashes freight cash without changing economic cost; prevents overpay on restore", async () => {
  const input = {
    expenseId,
    amount: "50",
    paidAt: "2026-09-01",
    reference: "Transfer",
    notes: "",
  };
  await saveFreightPayment(actorId, input);
  const payment = await memory.active.freightExpensePayment.findFirstOrThrow();
  let report = await getProjectControl(projectId);
  expect(report.freightPaid).toBe("50.0000");
  expect(report.cash.net).toBe("-50.0000");
  expect(report.cash.nearTerm).toBe("70.0000");
  expect(
    report.categories.find((row) => row.category === "freight")?.recordedCost,
  ).toBe("100.0000");
  expect(report.freightAllowance).toBe("150.0000");
  await expect(
    saveFreightPayment(actorId, { ...input, amount: "71" }),
  ).rejects.toThrow("outstanding");
  await saveFreightPayment(actorId, { ...input, id: payment.id, amount: "60" });
  await removeFreightPayment(actorId, payment.id);
  report = await getProjectControl(projectId);
  expect(report.freightPaid).toBe("0.0000");
  expect(report.cash.nearTerm).toBe("120.0000");
  const batch = await memory.raw.trashBatch.findFirstOrThrow();
  await saveFreightPayment(actorId, { ...input, amount: "80" });
  await expect(restoreTrash(actorId, batch.id)).rejects.toThrow("overpay");
  const replacement =
    await memory.active.freightExpensePayment.findFirstOrThrow();
  await removeFreightPayment(actorId, replacement.id);
  await restoreTrash(actorId, batch.id);
  expect((await getProjectControl(projectId)).freightPaid).toBe("60.0000");
}, 30000);
it("separates invoiced merchandise, freight and services from planned Quote revenue", async () => {
  await memory.raw.clientBillingDocument.create({
    data: {
      projectId,
      documentType: "INVOICE",
      reference: "INV-control",
      documentDate: new Date("2026-09-01"),
      currencyCode: "EUR",
      totalHt: "1000",
      totalTtc: "1200",
      vatAmount: "200",
      freightCoverageHt: "200",
      otherCoverageHt: "100",
    },
  });
  await memory.raw.clientBillingDocument.create({
    data: {
      projectId,
      documentType: "QUOTE",
      reference: "Q-control",
      documentDate: new Date("2026-09-01"),
      currencyCode: "EUR",
      totalHt: "3000",
      totalTtc: "3600",
      freightCoverageHt: "600",
      otherCoverageHt: "300",
    },
  });
  const report = await getProjectControl(projectId);
  expect(report.categories.map((row) => row.billed)).toEqual([
    "700.0000",
    "200.0000",
    "100.0000",
  ]);
  expect(report.categories.map((row) => row.quoted)).toEqual([
    "2100.0000",
    "600.0000",
    "300.0000",
  ]);
  expect(report.received).toBe("0.0000");
  expect(report.billedTtc).toBe("1200.0000");
});
it("protects paid freight balances when editing VAT", async () => {
  await saveFreightPayment(actorId, {
    expenseId,
    amount: "60",
    paidAt: "2026-09-01",
    reference: "Balance",
    notes: "",
  });
  await expect(
    updateProjectFreightExpense(actorId, { id: expenseId, projectId }),
  ).rejects.toThrow("below payments");
});
it("includes freight payments once in Project and global actual cash reporting", async () => {
  const snapshot = await getProjectReportingSnapshot(projectId, {
    horizon: "30d",
    start: "2026-09-01",
    end: "2026-09-30",
  });
  expect(snapshot?.freightPaid).toBe("120.0000");
  expect(snapshot?.cashPosition).toBe("-120.0000");
  const report = await getActualCashReport({ projectId });
  expect(
    report.rows.filter((row) => row.direction === "SUPPLIER_PAYMENT"),
  ).toHaveLength(2);
});
it("retains the same cash identity and FX when its expense relationship is removed", async () => {
  const payment = await memory.active.freightExpensePayment.findFirstOrThrow();
  await unassignFreightPayments(actorId, [payment.id]);
  expect(
    await memory.active.freightExpensePayment.findUnique({
      where: { id: payment.id },
    }),
  ).toBeNull();
  const cash = await memory.active.unassignedCashRecord.findUniqueOrThrow({
    where: { id: payment.id },
  });
  expect(cash.amount.toString()).toBe(payment.amount.toString());
  expect(cash.fxRateToReporting).toEqual(payment.fxRateToReporting);
  expect(cash.cashDate).toEqual(payment.paidAt);
  expect(cash.currencyCode).toBe("EUR");
  expect((await getProjectControl(projectId)).freightPaid).toBe("60.0000");
});
