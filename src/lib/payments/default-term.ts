import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { supplierPayableBase } from "@/domain/payments/calculations";
import { vatAmount } from "@/domain/finance/calculations";
import type { CreateOrderInput } from "@/domain/procurement/validation";

/** Only called for a newly created Order without reviewed terms. Never rewrites history. */
export async function createDefaultSupplierTerm(
  tx: Prisma.TransactionClient,
  actorId: string,
  orderId: string,
  input: Pick<
    CreateOrderInput,
    | "purchaseCost"
    | "inputVatTreatment"
    | "inputVatAmount"
    | "inputVatTaxableBase"
    | "inputVatRate"
    | "orderCurrencyCode"
    | "purchaseFxRate"
  >,
) {
  const amount = supplierPayableBase({
    supplierPurchase: input.purchaseCost ?? "0",
    inputVatTreatment: input.inputVatTreatment,
    inputVatAmount:
      input.inputVatAmount ??
      (input.inputVatTaxableBase
        ? vatAmount(
            input.inputVatTaxableBase,
            input.inputVatRate ?? "0",
          ).toFixed(4)
        : undefined),
  });
  if (!amount.greaterThan(0)) return;
  await tx.paymentInstallment.create({
    data: {
      orderId,
      direction: "SUPPLIER_PAYMENT",
      basis: "PERCENTAGE",
      percentageRate: "1",
      scheduledAmount: amount.toFixed(4),
      currencyCode: input.orderCurrencyCode,
      expectedFxRateToReporting: input.purchaseFxRate ?? null,
      dueDate: null,
      sequence: 1,
      label: "Full amount",
      createdById: actorId,
      updatedById: actorId,
    },
  });
}
