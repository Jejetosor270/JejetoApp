import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { CreditError, loadCreditSource, sourceCreditPosition } from "./source";
import { hasActiveCredits } from "./guards";

/** Protect both direct originals and Quote terms whose cash is recognized by an Invoice. */
export async function assertCreditSafeMutation(
  tx: Prisma.TransactionClient,
  model: string,
  ids: string[],
  retainHistory = false,
) {
  if (!ids.length) return;
  const id = { in: ids };
  const scopes: Record<string, Prisma.FinancialCreditWhereInput[]> = {
    ProcurementOrder: [
      { orderId: id },
      { allocations: { some: { orderId: id } } },
    ],
    ClientBillingDocument: [
      { billingDocumentId: id },
      { billingDocument: { matchedInstallment: { billingDocumentId: id } } },
    ],
    Project: [
      { order: { projectId: id } },
      { billingDocument: { projectId: id } },
    ],
    Client: [
      { billingDocument: { clientId: id } },
      { order: { project: { clientId: id } } },
    ],
    Supplier: [{ order: { supplierId: id } }],
    PaymentInstallment: [{ order: { paymentInstallments: { some: { id } } } }],
    ClientPaymentInstallment: [
      { billingDocument: { paymentInstallments: { some: { id } } } },
      { billingDocument: { matchedInstallmentId: id } },
    ],
    PaymentSettlement: [
      {
        order: {
          paymentInstallments: { some: { settlements: { some: { id } } } },
        },
      },
    ],
    ClientReceipt: [
      { billingDocument: { receipts: { some: { id } } } },
      {
        billingDocument: { matchedInstallment: { receipts: { some: { id } } } },
      },
    ],
    ClientBillingAllocation: [
      { billingDocument: { allocations: { some: { id } } } },
    ],
  };
  const OR = scopes[model];
  if (!OR) return;
  if (
    await tx.financialCredit.count({
      where: { ...(retainHistory ? {} : { isCancelled: false }), OR },
    })
  )
    throw new CreditError(
      retainHistory
        ? "This record is linked to credit history and cannot be moved to Trash. Credit/refund corrections use their audited cancellation actions."
        : "Review and cancel related refunds and credits before changing these original records or assignments.",
    );
}

/** Null means no credit adjustment; never reinterpret the original payment schedule. */
export async function creditPaymentLimit(
  tx: Prisma.TransactionClient,
  side: "CLIENT" | "SUPPLIER",
  sourceId: string,
) {
  const scope = { side, sourceId };
  if (!(await hasActiveCredits(tx, scope))) return null;
  const source = await loadCreditSource(tx, scope);
  if (!source)
    throw new CreditError(
      "The original financial record is no longer available.",
    );
  if (source.blockedReason) throw new CreditError(source.blockedReason);
  return sourceCreditPosition(source).cash.outstanding;
}
