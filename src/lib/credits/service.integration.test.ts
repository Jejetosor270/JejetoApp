import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";

const state = vi.hoisted(() => ({
  db: undefined as PrismaClient | undefined,
  actorId: "",
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: async () => ({ id: state.actorId, role: "MANAGER" }),
  requireMasterDataEditor: async () => ({ id: state.actorId, role: "MANAGER" }),
}));

import {
  cancelCredit,
  cancelRefund,
  createCredit,
  getCreditWorkspace,
  recordCreditRefund,
} from "./service";
import { createInstallment, updateInstallment } from "@/lib/payments/payments";

let memory: Awaited<ReturnType<typeof prismaMemoryDatabase>>;
let projectId: string;
let clientId: string;
let supplierId: string;
const day = (value = "2026-10-01") => new Date(`${value}T00:00:00.000Z`);

beforeAll(async () => {
  memory = await prismaMemoryDatabase();
  state.db = memory.active;
  await memory.raw.currency.createMany({
    data: [
      { code: "EUR", name: "Euro" },
      { code: "USD", name: "US dollar" },
    ],
  });
}, 30000);
afterAll(async () => memory?.close());
beforeEach(async () => {
  const actor = await memory.raw.user.create({
    data: {
      name: "Credit reviewer",
      email: `${randomUUID()}@example.test`,
      role: "MANAGER",
    },
  });
  state.actorId = actor.id;
  const client = await memory.raw.client.create({
    data: {
      legalName: "Example Client",
      displayName: "Client",
      defaultCurrencyCode: "EUR",
    },
  });
  clientId = client.id;
  const supplier = await memory.raw.supplier.create({
    data: {
      legalName: "Example Supplier",
      displayName: "Supplier",
      defaultCurrencyCode: "EUR",
    },
  });
  supplierId = supplier.id;
  const project = await memory.raw.project.create({
    data: {
      code: randomUUID(),
      name: "Credit Project",
      clientId,
      reportingCurrencyCode: "EUR",
    },
  });
  projectId = project.id;
});

async function invoice(
  options: {
    currencyCode?: string;
    paid?: string;
    totalHt?: string;
    vatAmount?: string;
  } = {},
) {
  const document = await memory.raw.clientBillingDocument.create({
    data: {
      clientId,
      projectId,
      documentType: "INVOICE",
      reference: randomUUID(),
      documentDate: day(),
      currencyCode: options.currencyCode ?? "EUR",
      fxRateToReporting: options.currencyCode === "USD" ? "0.8" : null,
      totalHt: options.totalHt ?? "1000",
      vatAmount: options.vatAmount ?? "0",
      totalTtc: options.totalHt ?? "1000",
    },
  });
  if (options.paid)
    await memory.raw.clientReceipt.create({
      data: {
        billingDocumentId: document.id,
        amount: options.paid,
        receivedAt: day(),
      },
    });
  return { side: "CLIENT" as const, sourceId: document.id };
}
async function order() {
  const source = await memory.raw.procurementOrder.create({
    data: {
      projectId,
      supplierId,
      orderNumber: randomUUID(),
      packageName: "Furniture",
      status: "ORDERED",
      invoiceDate: day(),
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
      pricingMode: "DIRECT_SELLING_PRICE",
      sellingPriceAmount: "200",
      costLines: {
        create: { category: "SUPPLIER_PURCHASE", originalAmount: "100" },
      },
      vatEntries: {
        create: {
          direction: "INPUT",
          treatment: "DOMESTIC",
          taxableBaseAmount: "100",
          vatRate: "0.2",
          vatAmount: "20",
          recoverability: "PARTIALLY_RECOVERABLE",
          recoverableRate: "0.5",
        },
      },
    },
    include: { vatEntries: true },
  });
  return { scope: { side: "SUPPLIER" as const, sourceId: source.id }, source };
}
async function workspace(scope: {
  side: "CLIENT" | "SUPPLIER";
  sourceId: string;
}) {
  const current = await getCreditWorkspace(scope);
  if (!current) throw new Error("Expected eligible credit source.");
  return current;
}
async function creditInput(
  scope: { side: "CLIENT" | "SUPPLIER"; sourceId: string },
  totalHt = "200",
) {
  return {
    ...scope,
    expectedVersion: (await workspace(scope)).expectedVersion,
    reference: randomUUID(),
    creditDate: "2026-10-02",
    totalHt,
    vatAmount: "0",
    freightCoverageHt: "0",
    otherCoverageHt: "0",
    reason: "Reviewed agreed reduction",
    allocations: [],
  };
}

describe("reviewed credits and actual refunds through real Prisma", () => {
  it("applies only the credit to debt, preserves originals and cash, and audits the original record", async () => {
    const scope = await invoice({ paid: "400" });
    const created = await createCredit(await creditInput(scope));
    const current = await workspace(scope);
    expect(current.remaining.totalTtc).toBe("800.0000");
    expect(current.cash).toMatchObject({
      paidTtc: "400.0000",
      outstanding: "400.0000",
      refundDue: "0.0000",
    });
    const original = await memory.raw.clientBillingDocument.findUniqueOrThrow({
      where: { id: scope.sourceId },
      include: { receipts: true },
    });
    expect(original.totalHt.toString()).toBe("1000");
    expect(original.receipts.map((row) => row.amount.toString())).toEqual([
      "400",
    ]);
    expect(
      await memory.raw.financialCreditRefund.count({
        where: { creditId: created.id },
      }),
    ).toBe(0);
    expect(
      await memory.raw.auditEvent.count({
        where: { entityId: scope.sourceId, entityType: "BILLING_DOCUMENT" },
      }),
    ).toBe(1);
  });

  it("records a paid Invoice refund separately at actual FX and retains cancellable history", async () => {
    const scope = await invoice({ currencyCode: "USD", paid: "1000" });
    const created = await createCredit(await creditInput(scope));
    let current = await workspace(scope);
    expect(current.cash?.refundDue).toBe("200.0000");
    const refund = {
      side: scope.side,
      creditId: created.id,
      expectedVersion: current.expectedVersion,
      amount: "120",
      refundDate: "2026-10-02",
    };
    await expect(recordCreditRefund(refund)).rejects.toThrow(
      /actual refund FX/,
    );
    const saved = await recordCreditRefund({ ...refund, fxRate: "0.9" });
    const record = await memory.raw.financialCredit.findUniqueOrThrow({
      where: { id: created.id },
      include: { refunds: true },
    });
    expect(record.fxRateToReporting?.toString()).toBe("0.8");
    expect(record.refunds[0]?.fxRateToReporting?.toString()).toBe("0.9");
    current = await workspace(scope);
    expect(current.cash).toMatchObject({
      paidTtc: "1000.0000",
      netPaid: "880.0000",
      outstanding: "0.0000",
      refundDue: "80.0000",
    });
    await expect(
      cancelCredit({
        creditId: created.id,
        expectedVersion: current.expectedVersion,
        reason: "Correction",
      }),
    ).rejects.toThrow(/refund entries/);
    await cancelRefund({
      refundId: saved.id,
      expectedVersion: current.expectedVersion,
      reason: "Wrong refund entry",
    });
    await cancelCredit({
      creditId: created.id,
      expectedVersion: (await workspace(scope)).expectedVersion,
      reason: "Wrong credit",
    });
    current = await workspace(scope);
    expect(current.cash?.netDue).toBe("1000.0000");
    expect(current.credits[0]?.isCancelled).toBe(true);
    expect(current.credits[0]?.refunds[0]?.isCancelled).toBe(true);
  });

  it("rejects over-crediting, stale drafts and privilege changes inside the transaction", async () => {
    const scope = await invoice();
    await expect(
      createCredit(await creditInput(scope, "1001")),
    ).rejects.toThrow(/original/);
    const stale = await creditInput(scope);
    await memory.raw.clientReceipt.create({
      data: {
        billingDocumentId: scope.sourceId,
        amount: "10",
        receivedAt: day(),
      },
    });
    await expect(createCredit(stale)).rejects.toThrow(/changed/);
    const denied = await creditInput(scope);
    await memory.raw.user.update({
      where: { id: state.actorId },
      data: { role: "USER" },
    });
    await expect(createCredit(denied)).rejects.toThrow(
      /Administrator or Manager/,
    );
    expect(
      await memory.raw.financialCredit.count({
        where: { billingDocumentId: scope.sourceId },
      }),
    ).toBe(0);
  });

  it("requires chosen Order attribution and does not silently reduce another Order", async () => {
    const scope = await invoice();
    const first = await order();
    const second = await order();
    await memory.raw.clientBillingAllocation.createMany({
      data: [
        {
          billingDocumentId: scope.sourceId,
          orderId: first.scope.sourceId,
          basis: "FIXED_AMOUNT",
          allocatedAmount: "600",
        },
        {
          billingDocumentId: scope.sourceId,
          orderId: second.scope.sourceId,
          basis: "FIXED_AMOUNT",
          allocatedAmount: "400",
        },
      ],
    });
    const input = await creditInput(scope);
    await expect(createCredit(input)).rejects.toThrow(/original/);
    const created = await createCredit({
      ...input,
      allocations: [
        {
          orderId: first.scope.sourceId,
          amountHt: "200",
          freightCoverageHt: "0",
          otherCoverageHt: "0",
        },
      ],
    });
    const stored = await memory.raw.financialCreditAllocation.findMany({
      where: { creditId: created.id },
    });
    expect(stored.map((row) => [row.orderId, row.amountHt.toString()])).toEqual(
      [[first.scope.sourceId, "200"]],
    );
    expect(
      (await workspace(scope)).orderAllocations.map((row) => row.amountHt),
    ).toEqual(["400.0000", "400.0000"]);
    expect(
      (
        await memory.raw.clientBillingAllocation.findMany({
          where: { billingDocumentId: scope.sourceId },
        })
      ).map((row) => row.allocatedAmount.toString()),
    ).toEqual(["600", "400"]);
  });

  it("snapshots explicit partial input VAT recovery without repricing Supplier Orders", async () => {
    const { scope, source } = await order();
    const input = { ...(await creditInput(scope, "50")), vatAmount: "10" };
    await expect(
      createCredit({ ...input, supplierVatEntryId: randomUUID() }),
    ).rejects.toThrow(/original invoice-payable/);
    const saved = await createCredit({
      ...input,
      supplierVatEntryId: source.vatEntries[0]?.id,
    });
    const stored = await memory.raw.financialCredit.findUniqueOrThrow({
      where: { id: saved.id },
    });
    expect(stored.supplierRecoverableRate?.toString()).toBe("0.5");
    expect(stored.supplierVatEntryId).toBe(source.vatEntries[0]?.id);
    expect((await workspace(scope)).cash?.outstanding).toBe("60.0000");
    const original = await memory.raw.procurementOrder.findUniqueOrThrow({
      where: { id: source.id },
      include: { costLines: true, vatEntries: true },
    });
    expect(original.sellingPriceAmount?.toString()).toBe("200");
    expect(original.costLines[0]?.originalAmount.toString()).toBe("100");
    expect(original.vatEntries[0]?.vatAmount.toString()).toBe("20");
  });

  it("caps refunds by both actual overpayment and remaining individual credit, including pooled cancellations", async () => {
    const scope = await invoice({ paid: "900" });
    const first = await createCredit(await creditInput(scope, "200"));
    const second = await createCredit(await creditInput(scope, "200"));
    let current = await workspace(scope);
    await expect(
      recordCreditRefund({
        side: "CLIENT",
        creditId: first.id,
        expectedVersion: current.expectedVersion,
        amount: "201",
        refundDate: "2026-10-02",
      }),
    ).rejects.toThrow(/exceeds/);
    await recordCreditRefund({
      side: "CLIENT",
      creditId: first.id,
      expectedVersion: current.expectedVersion,
      amount: "200",
      refundDate: "2026-10-02",
    });
    current = await workspace(scope);
    expect(current.cash?.refundDue).toBe("100.0000");
    await expect(
      cancelCredit({
        creditId: second.id,
        expectedVersion: current.expectedVersion,
        reason: "Correction",
      }),
    ).rejects.toThrow(/Refunds exceed/);
    await expect(
      recordCreditRefund({
        side: "CLIENT",
        creditId: second.id,
        expectedVersion: current.expectedVersion,
        amount: "101",
        refundDate: "2026-10-02",
      }),
    ).rejects.toThrow(/exceeds/);
  });

  it("blocks ambiguous Supplier VAT and mixed term currency, and safely shows zero original balances", async () => {
    const { scope, source } = await order();
    await memory.raw.procurementOrderVatEntry.create({
      data: {
        orderId: source.id,
        direction: "INPUT",
        treatment: "DOMESTIC",
        taxableBaseAmount: "100",
        vatRate: "0.1",
        vatAmount: "10",
        recoverability: "RECOVERABLE",
        recoverableRate: "1",
      },
    });
    expect((await workspace(scope)).blockedReason).toMatch(
      /multiple input VAT/,
    );
    await expect(createCredit(await creditInput(scope, "10"))).rejects.toThrow(
      /multiple input VAT/,
    );
    const next = await order();
    await memory.raw.paymentInstallment.create({
      data: {
        orderId: next.source.id,
        direction: "SUPPLIER_PAYMENT",
        sequence: 1,
        label: "Foreign term",
        basis: "FIXED_AMOUNT",
        scheduledAmount: "100",
        currencyCode: "USD",
      },
    });
    expect((await workspace(next.scope)).cash).toBeNull();
    await expect(
      createCredit(await creditInput(next.scope, "10")),
    ).rejects.toThrow(/mixed-currency/);
    const zero = await invoice({ totalHt: "0" });
    expect((await workspace(zero)).remaining.totalTtc).toBe("0.0000");
    expect((await workspace(zero)).cash?.outstanding).toBe("0.0000");
  });

  it("retains credit currency/FX when missing, rejects non-issued Client documents and duplicate historical references", async () => {
    const scope = await invoice({ currencyCode: "USD" });
    await memory.raw.clientBillingDocument.update({
      where: { id: scope.sourceId },
      data: { fxRateToReporting: null },
    });
    const input = await creditInput(scope);
    const saved = await createCredit(input);
    expect(
      (
        await memory.raw.financialCredit.findUniqueOrThrow({
          where: { id: saved.id },
        })
      ).fxRateToReporting,
    ).toBeNull();
    await cancelCredit({
      creditId: saved.id,
      expectedVersion: (await workspace(scope)).expectedVersion,
      reason: "Correction",
    });
    await expect(
      createCredit({
        ...input,
        expectedVersion: (await workspace(scope)).expectedVersion,
      }),
    ).rejects.toThrow(/reference already exists/);
    const planned = await invoice();
    await memory.raw.clientBillingDocument.update({
      where: { id: planned.sourceId },
      data: { workflowStatus: "TO_BE_INVOICED" },
    });
    expect(await getCreditWorkspace(planned)).toBeNull();
    await memory.raw.clientBillingDocument.update({
      where: { id: planned.sourceId },
      data: { workflowStatus: "INVOICED", documentType: "QUOTE" },
    });
    expect(await getCreditWorkspace(planned)).toBeNull();
  });

  it("enforces the prepared migration checks and restrictive history links, preserving attribution after actor deletion", async () => {
    const scope = await invoice({ paid: "1000" });
    const saved = await createCredit(await creditInput(scope));
    await expect(
      memory.raw.financialCredit.update({
        where: { id: saved.id },
        data: { totalHt: "-1" },
      }),
    ).rejects.toThrow();
    await expect(
      memory.raw.financialCredit.update({
        where: { id: saved.id },
        data: { side: "OTHER" },
      }),
    ).rejects.toThrow();
    await expect(
      memory.raw.financialCreditRefund.create({
        data: { creditId: saved.id, amount: "0", refundDate: day() },
      }),
    ).rejects.toThrow();
    const refunded = await recordCreditRefund({
      side: "CLIENT",
      creditId: saved.id,
      expectedVersion: (await workspace(scope)).expectedVersion,
      amount: "100",
      refundDate: "2026-10-02",
    });
    await expect(
      memory.raw.clientBillingDocument.delete({
        where: { id: scope.sourceId },
      }),
    ).rejects.toThrow();
    await expect(
      memory.raw.financialCredit.delete({ where: { id: saved.id } }),
    ).rejects.toThrow();
    await memory.raw.user.delete({ where: { id: state.actorId } });
    expect(
      (
        await memory.raw.financialCredit.findUniqueOrThrow({
          where: { id: saved.id },
        })
      ).createdById,
    ).toBeNull();
    expect(
      (
        await memory.raw.financialCreditRefund.findUniqueOrThrow({
          where: { id: refunded.id },
        })
      ).createdById,
    ).toBeNull();
    expect(
      await memory.raw.auditEvent.count({
        where: { entityId: scope.sourceId },
      }),
    ).toBe(2);
  });

  it("retains cancelled VAT credit snapshots while allowing corrected source VAT to be replaced", async () => {
    const { scope, source } = await order();
    const vat = source.vatEntries[0];
    if (!vat) throw new Error("Expected input VAT fixture.");
    const saved = await createCredit({
      ...(await creditInput(scope, "50")),
      vatAmount: "10",
      supplierVatEntryId: vat.id,
    });
    // An active VAT credit cannot lose its source through a direct DB deletion either.
    await expect(
      memory.raw.procurementOrderVatEntry.delete({ where: { id: vat.id } }),
    ).rejects.toThrow();
    await cancelCredit({
      creditId: saved.id,
      expectedVersion: (await workspace(scope)).expectedVersion,
      reason: "Source VAT correction",
    });
    await memory.raw.procurementOrderVatEntry.delete({ where: { id: vat.id } });
    const history = await memory.raw.financialCredit.findUniqueOrThrow({
      where: { id: saved.id },
    });
    expect(history.supplierVatEntryId).toBeNull();
    expect(history.supplierRecoverableRate?.toString()).toBe("0.5");
    expect(history.vatAmount.toString()).toBe("10");
    expect((await workspace(scope)).credits[0]?.isCancelled).toBe(true);
    expect((await workspace(scope)).cash?.netDue).toBe("100.0000");
  });

  it("counts matched Quote receipts once and blocks ambiguous or unlike-currency matches", async () => {
    const quote = await invoice({ paid: "300" });
    await memory.raw.clientBillingDocument.update({
      where: { id: quote.sourceId },
      data: { documentType: "QUOTE" },
    });
    const term = await memory.raw.clientPaymentInstallment.create({
      data: {
        billingDocumentId: quote.sourceId,
        sequence: 1,
        label: "Matched quote",
        basis: "FIXED_AMOUNT",
        scheduledAmount: "1000",
        currencyCode: "EUR",
      },
    });
    await memory.raw.clientReceipt.updateMany({
      where: { billingDocumentId: quote.sourceId },
      data: { installmentId: term.id },
    });
    const scope = await invoice({ paid: "100" });
    await memory.raw.clientBillingDocument.update({
      where: { id: scope.sourceId },
      data: { matchedInstallmentId: term.id },
    });
    const created = await createCredit(await creditInput(scope));
    expect((await workspace(scope)).cash).toMatchObject({
      paidTtc: "400.0000",
      outstanding: "400.0000",
    });
    await memory.raw.clientPaymentInstallment.update({
      where: { id: term.id },
      data: { currencyCode: "USD" },
    });
    expect((await workspace(scope)).blockedReason).toMatch(/mixed-currency/);
    expect((await workspace(scope)).cash).toBeNull();
    await memory.raw.clientPaymentInstallment.update({
      where: { id: term.id },
      data: { currencyCode: "EUR" },
    });
    const second = await invoice();
    await memory.raw.clientBillingDocument.update({
      where: { id: second.sourceId },
      data: { matchedInstallmentId: term.id, workflowStatus: "TO_BE_INVOICED" },
    });
    expect((await workspace(scope)).blockedReason).toMatch(/ambiguous/);
    await expect(
      cancelCredit({
        creditId: created.id,
        expectedVersion: (await workspace(scope)).expectedVersion,
        reason: "Correction",
      }),
    ).rejects.toThrow(/ambiguous/);
  });

  it("rejects new foreign Supplier terms and unpaid term currency changes while preserving same-currency schedule edits", async () => {
    const { scope, source } = await order();
    const term = await memory.raw.paymentInstallment.create({
      data: {
        orderId: source.id,
        direction: "SUPPLIER_PAYMENT",
        sequence: 1,
        label: "Original payment",
        basis: "FIXED_AMOUNT",
        scheduledAmount: "120",
        currencyCode: "EUR",
      },
    });
    await createCredit(await creditInput(scope, "20"));
    const input = {
      orderId: source.id,
      direction: "SUPPLIER_PAYMENT" as const,
      basis: "FIXED_AMOUNT" as const,
      fixedAmount: "30",
      currencyCode: "USD",
      label: "Reviewed payment",
      dueDate: "2026-11-01",
    };
    await expect(createInstallment(state.actorId, input)).rejects.toThrow(
      /original Order currency/,
    );
    await expect(
      updateInstallment(state.actorId, { ...input, id: term.id }),
    ).rejects.toThrow(/original Order currency/);
    expect(
      (
        await memory.raw.paymentInstallment.findUniqueOrThrow({
          where: { id: term.id },
        })
      ).currencyCode,
    ).toBe("EUR");
    await updateInstallment(state.actorId, {
      ...input,
      id: term.id,
      currencyCode: "EUR",
      fixedAmount: "100",
    });
    const edited = await memory.raw.paymentInstallment.findUniqueOrThrow({
      where: { id: term.id },
    });
    expect(edited.scheduledAmount.toString()).toBe("100");
    expect(edited.dueDate?.toISOString().slice(0, 10)).toBe("2026-11-01");
    await createInstallment(state.actorId, { ...input, currencyCode: "EUR" });
    expect(
      await memory.raw.paymentInstallment.count({
        where: { orderId: source.id },
      }),
    ).toBe(2);
    expect((await workspace(scope)).blockedReason).toBeNull();
  });

  it("keeps cancelled credit/refund history in its original currency after a source correction", async () => {
    const scope = await invoice({ currencyCode: "USD", paid: "1000" });
    const credit = await createCredit(await creditInput(scope));
    const refund = await recordCreditRefund({
      side: "CLIENT",
      creditId: credit.id,
      expectedVersion: (await workspace(scope)).expectedVersion,
      amount: "100",
      refundDate: "2026-10-02",
      fxRate: "0.9",
    });
    await cancelRefund({
      refundId: refund.id,
      expectedVersion: (await workspace(scope)).expectedVersion,
      reason: "Currency correction",
    });
    await cancelCredit({
      creditId: credit.id,
      expectedVersion: (await workspace(scope)).expectedVersion,
      reason: "Currency correction",
    });
    await memory.raw.clientBillingDocument.update({
      where: { id: scope.sourceId },
      data: { currencyCode: "EUR", fxRateToReporting: null },
    });
    const current = await workspace(scope);
    expect(current.currencyCode).toBe("EUR");
    expect(current.credits[0]?.currencyCode).toBe("USD");
    expect(current.credits[0]?.reportingCurrencyCode).toBe("EUR");
    expect(current.credits[0]?.refunds[0]?.amount).toBe("100");
    await memory.raw.clientBillingDocument.update({
      where: { id: scope.sourceId },
      data: { isCancelled: true, workflowStatus: "CANCELLED" },
    });
    const cancelled = await workspace(scope);
    expect(cancelled.blockedReason).toMatch(/history is read-only/);
    expect(cancelled.cash).toBeNull();
    expect(cancelled.credits[0]?.refunds[0]?.id).toBe(refund.id);
    await expect(createCredit(await creditInput(scope, "10"))).rejects.toThrow(
      /active original/,
    );
  });

  it("keeps Supplier credit history readable after cancelling its original Order without re-enabling writes", async () => {
    const { scope } = await order();
    const credit = await createCredit(await creditInput(scope, "20"));
    await cancelCredit({
      creditId: credit.id,
      expectedVersion: (await workspace(scope)).expectedVersion,
      reason: "Supplier order cancelled",
    });
    await memory.raw.procurementOrder.update({
      where: { id: scope.sourceId },
      data: { status: "CANCELLED" },
    });
    const current = await workspace(scope);
    expect(current.blockedReason).toMatch(/history is read-only/);
    expect(current.cash).toBeNull();
    expect(current.credits[0]?.id).toBe(credit.id);
    expect(current.credits[0]?.isCancelled).toBe(true);
    await expect(createCredit(await creditInput(scope, "10"))).rejects.toThrow(
      /active original/,
    );
  });
});
