import { generateKeyPairSync, sign } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { prismaMemoryDatabase } from "@/test/prisma-memory-database";

const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => state.db }));
import {
  authenticateCashConnection,
  createConnectionToken,
  revokeConnectionToken,
  type CashConnection,
} from "./auth";
import {
  approvalMessage,
  type CashChange,
  type CashProposalReview,
} from "./cash-contract";
import {
  executeCashChange,
  prepareCashChange,
  reviewCashChange,
} from "./cash-proposals";

let memory: Awaited<ReturnType<typeof prismaMemoryDatabase>>;
let serial = 0;
let identity: { context: CashConnection; privateKey: string } | undefined;
const connection = () => {
  if (!identity) throw new Error("Missing test identity");
  return identity;
};
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
beforeEach(async () => {
  const actor = await memory.raw.user.create({
    data: {
      name: "Owner",
      email: `cash-owner-${++serial}@example.test`,
      role: "ADMIN",
      passwordHash: "fictional-password-hash",
    },
  });
  vi.stubEnv("ERP_MCP_OWNER_ID", actor.id);
  vi.stubEnv("ERP_MCP_ORIGIN", "https://erp.example.test");
  const key = await createConnectionToken(actor.id, "CASH_WRITE");
  const context = await authenticateCashConnection(`Bearer ${key.token}`);
  if (!context || !key.approvalPrivateKey)
    throw new Error("Test write key unavailable");
  identity = { context, privateKey: key.approvalPrivateKey };
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
afterAll(async () => memory?.close());

async function fixture(currency = "EUR") {
  const client = await memory.raw.client.create({
    data: {
      legalName: "Client",
      displayName: "Client",
      defaultCurrencyCode: currency,
    },
  });
  const supplier = await memory.raw.supplier.create({
    data: {
      legalName: "Supplier",
      displayName: "Supplier",
      defaultCurrencyCode: currency,
    },
  });
  const project = await memory.raw.project.create({
    data: {
      code: `CASH-PROPOSAL-${++serial}`,
      name: "Fictional project",
      clientId: client.id,
      reportingCurrencyCode: "EUR",
    },
  });
  const order = await memory.raw.procurementOrder.create({
    data: {
      projectId: project.id,
      supplierId: supplier.id,
      orderNumber: `ORDER-${serial}`,
      packageName: "Furniture",
      orderCurrencyCode: currency,
      sellingCurrencyCode: "EUR",
      purchaseFxRateToReporting: currency === "EUR" ? null : "0.9",
      costLines: {
        create: [
          { category: "SUPPLIER_PURCHASE", originalAmount: "100" },
          { category: "FREIGHT", originalAmount: "20" },
        ],
      },
    },
  });
  const supplierTerm = await memory.raw.paymentInstallment.create({
    data: {
      orderId: order.id,
      direction: "SUPPLIER_PAYMENT",
      sequence: 1,
      label: "Full amount",
      basis: "FIXED_AMOUNT",
      scheduledAmount: "120",
      currencyCode: currency,
      expectedFxRateToReporting: currency === "EUR" ? null : "0.85",
    },
  });
  const billing = await memory.raw.clientBillingDocument.create({
    data: {
      projectId: project.id,
      clientId: client.id,
      reference: `INV-${serial}`,
      documentType: "INVOICE",
      workflowStatus: "INVOICED",
      documentDate: new Date("2026-10-01"),
      currencyCode: currency,
      totalHt: "200",
      vatAmount: "40",
      totalTtc: "240",
      fxRateToReporting: currency === "EUR" ? null : "0.9",
    },
  });
  const clientTerm = await memory.raw.clientPaymentInstallment.create({
    data: {
      billingDocumentId: billing.id,
      sequence: 1,
      label: "Deposit",
      basis: "FIXED_AMOUNT",
      scheduledAmount: "120",
      currencyCode: currency,
      expectedFxRateToReporting: currency === "EUR" ? null : "0.85",
    },
  });
  return {
    project,
    order,
    supplierTerm,
    billing,
    clientTerm,
    client,
    supplier,
  };
}
function approval(
  review: CashProposalReview,
  privateKey = connection().privateKey,
) {
  const approvedAt = new Date().toISOString();
  return {
    proposalId: review.proposalId,
    approvedAt,
    signature: sign(
      null,
      Buffer.from(approvalMessage(review, approvedAt)),
      privateKey,
    ).toString("base64url"),
  };
}
async function commit(change: CashChange) {
  const review = await prepareCashChange(connection().context, change);
  return executeCashChange(connection().context, approval(review));
}
const payment = (id: string, amount = "30"): CashChange => ({
  action: "RECORD_SUPPLIER_PAYMENT",
  targetId: id,
  amount,
  currency: "EUR",
  date: "2026-10-02",
  reference: "BANK-PAYMENT",
});
const receipt = (
  id: string,
  amount = "50",
  installmentId?: string,
): CashChange => ({
  action: "RECORD_CLIENT_RECEIPT",
  targetId: id,
  amount,
  currency: "EUR",
  date: "2026-10-02",
  ...(installmentId ? { installmentId } : {}),
});

it("prepares exact cash for review without creating financial records, then records partial and remaining Supplier payments once", async () => {
  const f = await fixture();
  const review = await prepareCashChange(
    connection().context,
    payment(f.supplierTerm.id),
  );
  expect(review.sourceHref).toContain(f.order.id);
  expect(
    await reviewCashChange(connection().context, review.proposalId),
  ).toEqual(review);
  expect(
    await memory.raw.paymentSettlement.count({
      where: { installmentId: f.supplierTerm.id },
    }),
  ).toBe(0);
  const first = await executeCashChange(connection().context, approval(review));
  expect(
    (
      await memory.raw.paymentSettlement.findUniqueOrThrow({
        where: { id: first.resultId },
      })
    ).amount.toString(),
  ).toBe("30");
  const final = await commit(payment(f.supplierTerm.id, "REMAINING"));
  expect(
    (
      await memory.raw.paymentSettlement.findUniqueOrThrow({
        where: { id: final.resultId },
      })
    ).amount.toString(),
  ).toBe("90");
  const stored = await memory.raw.erpCashChangeProposal.findUniqueOrThrow({
    where: { id: review.proposalId },
  });
  expect(stored.executedAt).not.toBeNull();
  expect(stored.approvalSignature).not.toBeNull();
  expect(
    await memory.raw.auditEvent.count({
      where: {
        entityId: first.resultId,
        entityType: "SETTLEMENT",
        action: "CREATED",
      },
    }),
  ).toBe(1);
});

it("records partial Client receipts and caps a term's remaining amount before completing the Invoice", async () => {
  const f = await fixture();
  await commit(receipt(f.billing.id, "50", f.clientTerm.id));
  const termResult = await commit(
    receipt(f.billing.id, "REMAINING", f.clientTerm.id),
  );
  expect(
    (
      await memory.raw.clientReceipt.findUniqueOrThrow({
        where: { id: termResult.resultId },
      })
    ).amount.toString(),
  ).toBe("70");
  const rest = await commit(receipt(f.billing.id, "REMAINING"));
  const saved = await memory.raw.clientReceipt.findUniqueOrThrow({
    where: { id: rest.resultId },
  });
  expect(saved.amount.toString()).toBe("120");
  expect(saved.installmentId).toBeNull();
});

it("corrects selected Supplier cash and cancels it recoverably without touching its sibling payment", async () => {
  const f = await fixture();
  const first = await commit(payment(f.supplierTerm.id, "20"));
  const sibling = await commit(payment(f.supplierTerm.id, "10"));
  await commit({
    action: "UPDATE_SUPPLIER_PAYMENT",
    targetId: first.resultId,
    amount: "25",
    currency: "EUR",
    date: "2026-10-03",
    reason: "Correct bank entry",
  });
  expect(
    (
      await memory.raw.paymentSettlement.findUniqueOrThrow({
        where: { id: first.resultId },
      })
    ).amount.toString(),
  ).toBe("25");
  await commit({
    action: "CANCEL_SUPPLIER_PAYMENT",
    targetId: first.resultId,
    reason: "Duplicate bank entry",
  });
  const cancelled = await memory.raw.paymentSettlement.findUniqueOrThrow({
    where: { id: first.resultId },
  });
  expect(cancelled.trashedAt).not.toBeNull();
  expect(
    await memory.active.paymentSettlement.findUnique({
      where: { id: first.resultId },
    }),
  ).toBeNull();
  expect(
    (
      await memory.raw.paymentSettlement.findUniqueOrThrow({
        where: { id: sibling.resultId },
      })
    ).amount.toString(),
  ).toBe("10");
  expect(
    await memory.raw.auditEvent.count({
      where: { entityId: first.resultId, action: "DELETED" },
    }),
  ).toBe(1);
});

it("corrects and cancels one Client receipt while retaining its original row and attribution", async () => {
  const f = await fixture();
  const created = await commit(receipt(f.billing.id, "20", f.clientTerm.id));
  await commit({
    action: "UPDATE_CLIENT_RECEIPT",
    targetId: created.resultId,
    amount: "35",
    currency: "EUR",
    date: "2026-10-04",
    reason: "Correct receipt amount",
  });
  const updated = await memory.raw.clientReceipt.findUniqueOrThrow({
    where: { id: created.resultId },
  });
  expect(updated.amount.toString()).toBe("35");
  expect(updated.installmentId).toBe(f.clientTerm.id);
  await commit({
    action: "CANCEL_CLIENT_RECEIPT",
    targetId: created.resultId,
    reason: "Receipt recorded twice",
  });
  expect(
    (
      await memory.raw.clientReceipt.findUniqueOrThrow({
        where: { id: created.resultId },
      })
    ).trashedAt,
  ).not.toBeNull();
  expect(
    await memory.raw.auditEvent.count({
      where: { entityId: created.resultId, action: "UPDATED" },
    }),
  ).toBe(1);
  expect(
    await memory.raw.auditEvent.count({
      where: { entityId: created.resultId, action: "DELETED" },
    }),
  ).toBe(1);
});

it("rejects forged signatures and signatures copied from another proposal", async () => {
  const f = await fixture();
  const a = await prepareCashChange(
    connection().context,
    payment(f.supplierTerm.id),
  );
  const b = await prepareCashChange(
    connection().context,
    payment(f.supplierTerm.id, "40"),
  );
  const otherKey = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  await expect(
    executeCashChange(connection().context, approval(a, otherKey.privateKey)),
  ).rejects.toThrow();
  await expect(
    executeCashChange(connection().context, {
      ...approval(a),
      proposalId: b.proposalId,
    }),
  ).rejects.toThrow();
  const signed = approval(a);
  await expect(
    executeCashChange(connection().context, {
      ...signed,
      approvedAt: new Date(Date.now() - 1000).toISOString(),
    }),
  ).rejects.toThrow();
  expect(
    await memory.raw.paymentSettlement.count({
      where: { installmentId: f.supplierTerm.id },
    }),
  ).toBe(0);
});

it("rejects expired proposals even with a valid approval signature", async () => {
  const f = await fixture();
  const review = await prepareCashChange(
    connection().context,
    payment(f.supplierTerm.id),
  );
  const approved = approval(review);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(review.expiresAt).getTime() + 1);
  await expect(
    executeCashChange(connection().context, approved),
  ).rejects.toThrow();
  expect(
    await memory.raw.paymentSettlement.count({
      where: { installmentId: f.supplierTerm.id },
    }),
  ).toBe(0);
});

it("replays a successfully executed proposal without recording duplicate cash", async () => {
  const f = await fixture();
  const review = await prepareCashChange(
    connection().context,
    payment(f.supplierTerm.id),
  );
  const approved = approval(review);
  const first = await executeCashChange(connection().context, approved);
  const repeated = await executeCashChange(connection().context, approved);
  expect(repeated.resultId).toBe(first.resultId);
  expect(repeated.alreadyExecuted).toBe(true);
  expect(
    await reviewCashChange(connection().context, review.proposalId),
  ).toMatchObject({
    status: "EXECUTED",
    alreadyExecuted: true,
    resultId: first.resultId,
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(review.expiresAt).getTime() + 1);
  expect(
    await reviewCashChange(connection().context, review.proposalId),
  ).toMatchObject({
    status: "EXECUTED",
    alreadyExecuted: true,
    resultId: first.resultId,
  });
  expect(
    await memory.raw.paymentSettlement.count({
      where: { installmentId: f.supplierTerm.id },
    }),
  ).toBe(1);
});

it.each(["cost", "term", "cash"] as const)(
  "rejects approval when the Supplier %s changes after review",
  async (changed) => {
    const f = await fixture();
    const review = await prepareCashChange(
      connection().context,
      payment(f.supplierTerm.id),
    );
    if (changed === "cost")
      await memory.raw.procurementOrderCostLine.updateMany({
        where: { orderId: f.order.id, category: "SUPPLIER_PURCHASE" },
        data: { originalAmount: "99" },
      });
    if (changed === "term")
      await memory.raw.paymentInstallment.update({
        where: { id: f.supplierTerm.id },
        data: { dueDate: new Date("2026-11-02") },
      });
    if (changed === "cash")
      await memory.raw.paymentSettlement.create({
        data: {
          installmentId: f.supplierTerm.id,
          amount: "5",
          settledAt: new Date("2026-10-02"),
        },
      });
    await expect(
      executeCashChange(connection().context, approval(review)),
    ).rejects.toThrow();
    expect(
      await memory.raw.paymentSettlement.count({
        where: { installmentId: f.supplierTerm.id },
      }),
    ).toBe(changed === "cash" ? 1 : 0);
  },
);

it("rejects a stale receipt correction without overwriting another employee's change", async () => {
  const f = await fixture();
  const created = await commit(receipt(f.billing.id, "20"));
  const review = await prepareCashChange(connection().context, {
    action: "UPDATE_CLIENT_RECEIPT",
    targetId: created.resultId,
    amount: "25",
    currency: "EUR",
    date: "2026-10-04",
    reason: "Correct receipt",
  });
  await memory.raw.clientReceipt.update({
    where: { id: created.resultId },
    data: { reference: "Changed elsewhere" },
  });
  await expect(
    executeCashChange(connection().context, approval(review)),
  ).rejects.toThrow();
  expect(
    (
      await memory.raw.clientReceipt.findUniqueOrThrow({
        where: { id: created.resultId },
      })
    ).amount.toString(),
  ).toBe("20");
});

it("rejects revoked credentials and a mismatched owner at execution", async () => {
  const f = await fixture();
  const review = await prepareCashChange(
    connection().context,
    payment(f.supplierTerm.id),
  );
  const approved = approval(review);
  const foreign = {
    ...connection().context,
    actor: { ...connection().context.actor, id: f.client.id },
  };
  await expect(executeCashChange(foreign, approved)).rejects.toThrow();
  await revokeConnectionToken(
    connection().context.actor.id,
    connection().context.tokenId,
  );
  await expect(
    executeCashChange(connection().context, approved),
  ).rejects.toThrow();
  expect(
    await memory.raw.paymentSettlement.count({
      where: { installmentId: f.supplierTerm.id },
    }),
  ).toBe(0);
});

it("does not allow a replacement credential to execute an earlier key's proposal", async () => {
  const f = await fixture();
  const review = await prepareCashChange(
    connection().context,
    payment(f.supplierTerm.id),
  );
  const replacement = await createConnectionToken(
    connection().context.actor.id,
    "CASH_WRITE",
  );
  const next = await authenticateCashConnection(`Bearer ${replacement.token}`);
  if (!next) throw new Error("Replacement unavailable");
  await expect(executeCashChange(next, approval(review))).rejects.toThrow();
});

it("rejects a modified stored proposal without saving cash", async () => {
  const f = await fixture();
  const review = await prepareCashChange(
    connection().context,
    payment(f.supplierTerm.id),
  );
  const approved = approval(review);
  await memory.raw.erpCashChangeProposal.update({
    where: { id: review.proposalId },
    data: { amount: "35" },
  });
  await expect(
    executeCashChange(connection().context, approved),
  ).rejects.toThrow();
  expect(
    await memory.raw.paymentSettlement.count({
      where: { installmentId: f.supplierTerm.id },
    }),
  ).toBe(0);
});

it.each(["inactive", "demoted"])(
  "rejects an approved change after the account is %s",
  async (state) => {
    const f = await fixture();
    const review = await prepareCashChange(
      connection().context,
      payment(f.supplierTerm.id),
    );
    const approved = approval(review);
    await memory.raw.user.update({
      where: { id: connection().context.actor.id },
      data: state === "inactive" ? { isActive: false } : { role: "MANAGER" },
    });
    await expect(
      executeCashChange(connection().context, approved),
    ).rejects.toThrow();
    expect(
      await memory.raw.paymentSettlement.count({
        where: { installmentId: f.supplierTerm.id },
      }),
    ).toBe(0);
  },
);

it("keeps read-only credentials unable to authenticate for cash writes", async () => {
  const key = await createConnectionToken(
    connection().context.actor.id,
    "READ_ONLY",
  );
  expect(await authenticateCashConnection(`Bearer ${key.token}`)).toBeNull();
});

it.each(["DRAFT", "TO_BE_INVOICED", "CANCELLED"] as const)(
  "rejects receipts on a %s Billing document",
  async (workflowStatus) => {
    const f = await fixture();
    await memory.raw.clientBillingDocument.update({
      where: { id: f.billing.id },
      data: { workflowStatus, isCancelled: workflowStatus === "CANCELLED" },
    });
    await expect(
      prepareCashChange(connection().context, receipt(f.billing.id)),
    ).rejects.toThrow();
    expect(
      await memory.raw.clientReceipt.count({
        where: { billingDocumentId: f.billing.id },
      }),
    ).toBe(0);
  },
);

it("rejects Client Quotes, cancelled Supplier terms and trashed financial sources", async () => {
  const f = await fixture();
  await memory.raw.clientBillingDocument.update({
    where: { id: f.billing.id },
    data: { documentType: "QUOTE" },
  });
  await expect(
    prepareCashChange(connection().context, receipt(f.billing.id)),
  ).rejects.toThrow();
  await memory.raw.paymentInstallment.update({
    where: { id: f.supplierTerm.id },
    data: { isCancelled: true },
  });
  await expect(
    prepareCashChange(connection().context, payment(f.supplierTerm.id)),
  ).rejects.toThrow();
  await memory.raw.paymentInstallment.update({
    where: { id: f.supplierTerm.id },
    data: { isCancelled: false },
  });
  await memory.raw.procurementOrder.update({
    where: { id: f.order.id },
    data: { trashedAt: new Date() },
  });
  await expect(
    prepareCashChange(connection().context, payment(f.supplierTerm.id)),
  ).rejects.toThrow();
});

it("rejects overpayment and unrelated Client terms before creating a proposal", async () => {
  const f = await fixture();
  const other = await fixture();
  await expect(
    prepareCashChange(
      connection().context,
      payment(f.supplierTerm.id, "120.0001"),
    ),
  ).rejects.toThrow();
  await expect(
    prepareCashChange(connection().context, receipt(f.billing.id, "240.0001")),
  ).rejects.toThrow();
  await expect(
    prepareCashChange(
      connection().context,
      receipt(f.billing.id, "120.0001", f.clientTerm.id),
    ),
  ).rejects.toThrow();
  await expect(
    prepareCashChange(
      connection().context,
      receipt(f.billing.id, "20", other.clientTerm.id),
    ),
  ).rejects.toThrow();
  expect(
    await memory.raw.erpCashChangeProposal.count({
      where: { actorId: connection().context.actor.id },
    }),
  ).toBe(0);
});

it("requires explicit actual foreign FX and does not reuse document or expected FX", async () => {
  const f = await fixture("USD");
  const change: CashChange = {
    action: "RECORD_SUPPLIER_PAYMENT",
    targetId: f.supplierTerm.id,
    amount: "20",
    currency: "USD",
    date: "2026-10-03",
  };
  await expect(prepareCashChange(connection().context, change)).rejects.toThrow(
    /FX/,
  );
  const paid = await commit({ ...change, fxRate: "0.8765432101" });
  expect(
    (
      await memory.raw.paymentSettlement.findUniqueOrThrow({
        where: { id: paid.resultId },
      })
    ).fxRateToReporting?.toString(),
  ).toBe("0.8765432101");
  const clientChange: CashChange = {
    action: "RECORD_CLIENT_RECEIPT",
    targetId: f.billing.id,
    amount: "20",
    currency: "USD",
    date: "2026-10-03",
  };
  await expect(
    prepareCashChange(connection().context, clientChange),
  ).rejects.toThrow(/FX/);
  const received = await commit({ ...clientChange, fxRate: "0.8765432101" });
  expect(
    (
      await memory.raw.clientReceipt.findUniqueOrThrow({
        where: { id: received.resultId },
      })
    ).fxRateToReporting?.toString(),
  ).toBe("0.8765432101");
});

it("rejects mismatched currency and non-unit same-currency FX", async () => {
  const f = await fixture();
  await expect(
    prepareCashChange(connection().context, {
      ...payment(f.supplierTerm.id),
      currency: "USD",
    }),
  ).rejects.toThrow();
  await expect(
    prepareCashChange(connection().context, {
      ...receipt(f.billing.id),
      fxRate: "0.9",
    }),
  ).rejects.toThrow();
});
