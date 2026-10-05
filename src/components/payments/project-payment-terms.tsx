import { formatEnumLabel } from "@/domain/presentation/labels";
import Decimal from "decimal.js";
import { billingIsIssued } from "@/domain/billing/status";
import { recordPaymentStatusLabel } from "@/domain/payments/record-status";
import { formatMoney } from "@/domain/procurement/presentation";
import { getDatabase } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { getProjectPaymentSummaries } from "@/lib/payments/payments";
import { listProjectBillingDocuments } from "@/lib/billing/billing";
import { projectRead } from "@/lib/reporting/project-diagnostics";
import { businessToday, formatDateOnly } from "@/domain/payments/dates";
import { PaymentSchedule } from "./payment-schedule";
import { BillingScheduleManager } from "@/components/billing/billing-schedule-manager";
import { RelatedCashCreate } from "./related-cash-create";

function PaymentTermsSummary({
  title,
  status,
  amount,
  currency,
  dueDate,
  cancelled,
  planned = false,
}: {
  title: string;
  status: string;
  amount: string | null;
  currency: string;
  dueDate: string | null;
  cancelled: boolean;
  planned?: boolean;
}) {
  const settled = amount !== null && new Decimal(amount).lte(0);
  const due =
    cancelled || settled
      ? "Not applicable"
      : dueDate
        ? formatDateOnly(dueDate)
        : "Date needed";
  return (
    <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
      <span className="inline-flex flex-col gap-1 align-top">
        <span>{title}</span>
        <span className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs font-normal">
          <span>{status}</span>
          <span className="tabular-nums">
            {planned ? "Planned remainder TTC" : "Remaining TTC"}:{" "}
            {cancelled
              ? "Not applicable"
              : formatMoney(amount, currency, "Incomplete")}
          </span>
          <span>
            {planned ? "Planned due" : "Next due"}: {due}
          </span>
        </span>
      </span>
    </summary>
  );
}

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
          <PaymentTermsSummary
            title={`Purchasing · ${order.orderNumber} · ${summary.installments.length} ${summary.installments.length === 1 ? "term" : "terms"}`}
            status={recordPaymentStatusLabel(
              order.supplierPayment.status,
              null,
              order.status === "CANCELLED",
            )}
            amount={
              summary.reconciliationComplete
                ? order.supplierPayment.outstanding
                : null
            }
            currency={order.orderCurrencyCode}
            dueDate={order.supplierPayment.nextDueDate}
            cancelled={order.status === "CANCELLED"}
          />
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
              <PaymentTermsSummary
                title={`Billing · ${document.reference} · ${document.documentType === "QUOTE" ? "Quote plan" : billingIsIssued(document) ? "Invoice" : "Invoice plan"}`}
                status={formatEnumLabel(document.status)}
                amount={document.outstanding}
                currency={document.currencyCode}
                dueDate={document.dueDate}
                cancelled={
                  document.isCancelled || document.status === "CANCELLED"
                }
                planned={
                  document.documentType === "QUOTE" ||
                  !billingIsIssued(document)
                }
              />
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
