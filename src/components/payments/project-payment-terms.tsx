import { formatEnumLabel } from "@/domain/presentation/labels";
import { billingIsIssued } from "@/domain/billing/status";
import { getDatabase } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { getProjectPaymentSummaries } from "@/lib/payments/payments";
import { listProjectBillingDocuments } from "@/lib/billing/billing";
import { projectRead } from "@/lib/reporting/project-diagnostics";
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
  const [supplier, documents, currencies, project] = await Promise.all([
    projectRead("supplier payment terms", () =>
      getProjectPaymentSummaries(projectId),
    ),
    projectRead("billing payment terms", () =>
      listProjectBillingDocuments(projectId),
    ),
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
  return (
    <section className="space-y-4" id="payment-terms">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title">Payment terms</h2>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
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
      {!supplier.length && !documents.length && (
        <p className="text-muted-foreground text-sm">
          Create an Order or Billing document to add payment terms.
        </p>
      )}
      {supplier.map(({ order, summary }) => (
        <details className="bg-card rounded-lg border" key={order.id}>
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Purchasing · {order.orderNumber} · {summary.installments.length}{" "}
            terms
          </summary>
          <div className="border-t p-4">
            <PaymentSchedule
              canEdit={canEdit && order.status !== "CANCELLED"}
              currencies={currencies}
              direction="SUPPLIER_PAYMENT"
              orderId={order.id}
              reportingCurrencyCode={project.reportingCurrencyCode}
              summary={summary}
              today={businessToday()}
            />
          </div>
        </details>
      ))}
      {documents.map(
        (document) =>
          document && (
            <details className="bg-card rounded-lg border" key={document.id}>
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                Billing · {document.reference} ·{" "}
                {formatEnumLabel(document.documentType)}
              </summary>
              <div className="border-t p-4">
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
