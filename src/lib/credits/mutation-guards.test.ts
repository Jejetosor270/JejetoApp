import { beforeEach, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
vi.mock("server-only", () => ({}));
import {
  assertCreditSafeMutation,
  creditPaymentLimit,
} from "./mutation-guards";
const count = vi.fn();
const tx = {
  financialCredit: { count },
} as unknown as Prisma.TransactionClient;
beforeEach(() => {
  count.mockReset().mockResolvedValue(0);
});
it("leaves unrelated records and originals without credits unchanged", async () => {
  await assertCreditSafeMutation(tx, "Room", ["room"]);
  expect(count).not.toHaveBeenCalled();
  await expect(creditPaymentLimit(tx, "SUPPLIER", "order")).resolves.toBeNull();
});
it("blocks payment correction and unassignment when a related credit is active", async () => {
  count.mockResolvedValue(1);
  await expect(
    assertCreditSafeMutation(tx, "PaymentSettlement", ["cash"]),
  ).rejects.toThrow("cancel related refunds and credits");
  expect(count).toHaveBeenCalledWith({
    where: {
      isCancelled: false,
      OR: [
        {
          order: {
            paymentInstallments: {
              some: { settlements: { some: { id: { in: ["cash"] } } } },
            },
          },
        },
      ],
    },
  });
});
it("guards both direct and matched-Quote receipts", async () => {
  count.mockResolvedValue(1);
  await expect(
    assertCreditSafeMutation(tx, "ClientReceipt", ["receipt"]),
  ).rejects.toThrow();
  const query = count.mock.calls[0]?.[0];
  expect(query.where.OR).toHaveLength(2);
  expect(query.where.OR[1]).toEqual({
    billingDocument: {
      matchedInstallment: { receipts: { some: { id: { in: ["receipt"] } } } },
    },
  });
});
it("retains cancelled credit history during Trash rather than orphaning it", async () => {
  count.mockResolvedValue(1);
  await expect(
    assertCreditSafeMutation(tx, "ProcurementOrder", ["order"], true),
  ).rejects.toThrow("credit history");
  expect(count.mock.calls[0]?.[0].where).not.toHaveProperty("isCancelled");
});
