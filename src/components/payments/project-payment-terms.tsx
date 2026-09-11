import { billingIsIssued } from "@/domain/billing/status";
import { getDatabase } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { getOrderPaymentSummary } from "@/lib/payments/payments";
import { getClientBillingDocument } from "@/lib/billing/billing";
import { businessToday } from "@/domain/payments/dates";
import { PaymentSchedule } from "./payment-schedule";
import { BillingScheduleManager } from "@/components/billing/billing-schedule-manager";
import { RelatedCashCreate } from "./related-cash-create";

export async function ProjectPaymentTerms({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  await requireUser();
  const db = getDatabase();
  const [orders, documents, currencies, project] = await Promise.all([
    db.procurementOrder.findMany({
      where: { projectId },
      select: { id: true, orderNumber: true, status: true },
      orderBy: [{ orderNumber: "asc" }, { id: "asc" }],
    }),
    db.clientBillingDocument.findMany({
      where: { projectId },
      select: {
        id: true,
        reference: true,
        documentType: true,
        isCancelled: true,
        workflowStatus: true,
        matchedInstallmentId: true,
      },
      orderBy: [{ documentDate: "desc" }, { id: "asc" }],
    }),
    db.currency.findMany({ select: { code: true }, orderBy: { code: "asc" } }),
    db.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { reportingCurrencyCode: true },
    }),
  ]);
  const matched = new Set(
    documents.flatMap((row) =>
      billingIsIssued(row) && row.matchedInstallmentId
        ? [row.matchedInstallmentId]
        : [],
    ),
  );
  const [supplier, client] = await Promise.all([
    Promise.all(
      orders.map(async (order) => ({
        order,
        summary: await getOrderPaymentSummary(order.id),
      })),
    ),
    Promise.all(documents.map((row) => getClientBillingDocument(row.id))),
  ]);
  return (
    <section className="space-y-4" id="payment-terms">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Payment terms</h2>
        {canEdit && (
          <div className="flex gap-2">
            <RelatedCashCreate
              scope={{ kind: "project", id: projectId }}
              kind="supplier-installment"
            />
            <RelatedCashCreate
              scope={{ kind: "project", id: projectId }}
              kind="client-installment"
            />
          </div>
        )}
      </div>
      {!orders.length && !documents.length && (
        <p className="text-muted-foreground text-sm">
          Create an Order or Billing document to add payment terms.
        </p>
      )}
      {supplier.map(({ order, summary }) => (
        <details className="rounded border p-4" key={order.id}>
          <summary className="cursor-pointer font-medium">
            Purchasing · {order.orderNumber} ·{" "}
            {summary.supplier.installments.length} terms
          </summary>
          <div className="mt-4">
            <PaymentSchedule
              canEdit={canEdit && order.status !== "CANCELLED"}
              currencies={currencies}
              direction="SUPPLIER_PAYMENT"
              orderId={order.id}
              reportingCurrencyCode={project.reportingCurrencyCode}
              summary={summary.supplier}
              today={businessToday()}
            />
          </div>
        </details>
      ))}
      {client.map(
        (document) =>
          document && (
            <details className="rounded border p-4" key={document.id}>
              <summary className="cursor-pointer font-medium">
                Billing · {document.reference} · {document.documentType}
              </summary>
              <div className="mt-4">
                <BillingScheduleManager
                  canEdit={canEdit}
                  document={
                    document.documentType === "QUOTE"
                      ? {
                          ...document,
                          paymentInstallments:
                            document.paymentInstallments.filter(
                              (row) => !matched.has(row.id),
                            ),
                        }
                      : document
                  }
                />
              </div>
            </details>
          ),
      )}
    </section>
  );
}
