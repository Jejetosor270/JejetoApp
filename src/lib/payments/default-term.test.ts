import { expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
vi.mock("server-only", () => ({}));
import { createDefaultSupplierTerm } from "./default-term";

it("creates one undated 100% term including all Order costs and payable VAT", async () => {
  const create = vi.fn();
  const tx = {
    paymentInstallment: { create },
  } as unknown as Prisma.TransactionClient;
  const input = {
    purchaseCost: "100.1256",
    freight: "800",
    customsDuties: "20",
    miscellaneous: "10",
    inputVatTreatment: "DOMESTIC" as const,
    inputVatTaxableBase: "100.1256",
    inputVatRate: "0.2",
    orderCurrencyCode: "EUR",
  };
  await createDefaultSupplierTerm(tx, "actor", "order", input);
  expect(create).toHaveBeenCalledExactlyOnceWith({
    data: expect.objectContaining({
      orderId: "order",
      scheduledAmount: "950.1507",
      percentageRate: "1",
      dueDate: null,
      currencyCode: "EUR",
      sequence: 1,
    }),
  });
  create.mockClear();
  await createDefaultSupplierTerm(tx, "actor", "order", {
    ...input,
    purchaseCost: "0",
    freight: "0",
    customsDuties: "0",
    miscellaneous: "0",
    inputVatTaxableBase: "0",
  });
  expect(create).not.toHaveBeenCalled();
});
