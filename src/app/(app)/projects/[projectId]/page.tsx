import { projectFreightBudget } from "@/domain/freight/calculations";
import { ProjectPaymentTerms } from "@/components/payments/project-payment-terms";
import { ProjectCoverage } from "@/components/reporting/project-coverage";
import { getProjectControl } from "@/lib/reporting/project-control";
import { ProjectFinancialControl } from "@/components/reporting/project-control";
import { ProjectFreightPayments } from "@/components/freight/project-freight-payments";
import { RelatedCashCreate } from "@/components/payments/related-cash-create";
import { RelatedItems } from "@/components/items/related-items";
import { RelatedRecords } from "@/components/layout/related-records";
import { getProjectRelations } from "@/lib/related-records/records";
import { ProjectPurchaseBudget } from "@/components/procurement/project-purchase-budget";
import { optionalUuid } from "@/domain/listing/validation";
import { ProjectPackages } from "@/components/procurement/project-packages";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ProjectDetail } from "@/app/(app)/projects/[projectId]/project-detail";
import { ProjectFinancialDashboard } from "@/components/reporting/project-financial-dashboard";
import { isCashFlowHorizon, type CashFlowHorizon } from "@/config/reporting";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listProjectFormOptions } from "@/lib/master-data/lookups";
import { getProject } from "@/lib/master-data/projects";
import { getProjectReportingSnapshot } from "@/lib/reporting/reports";
import { getProjectClientBillingSummary } from "@/lib/billing/reporting";
import { ProjectFreightExpenses } from "@/components/freight/project-freight-expenses";
import {
  getProjectFreightReconciliation,
  listProjectFreightExpenses,
} from "@/lib/freight/expenses";
import {
  calculateProjectFinancialPerformance,
  calculateProjectTargets,
  calculateNetCashPosition,
  sumComparableFinancialAmounts,
} from "@/domain/projects/targets";
import { calculateProjectVatPosition } from "@/domain/vat/position";
import { calculateProjectFundingCoverage } from "@/domain/billing/funding-coverage";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ horizon?: string; tab?: string }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  if (!optionalUuid(projectId)) notFound();
  const destinations: Record<string, string> = {
    orders: "/orders",
    billing: "/billing",
    cash: "/reports",
    items: "/items",
  };
  const legacyDestination = Object.hasOwn(destinations, query.tab ?? "")
    ? destinations[query.tab ?? ""]
    : undefined;
  if (legacyDestination) {
    await requireUser();
    const destinationQuery = new URLSearchParams({ projectId });
    if (query.tab === "cash") {
      destinationQuery.set("view", "cash-flow");
      if (query.horizon) destinationQuery.set("horizon", query.horizon);
    }
    redirect(legacyDestination + "?" + destinationQuery);
  }
  const requestedHorizon = query.horizon ?? "";
  const horizon: CashFlowHorizon = isCashFlowHorizon(requestedHorizon)
    ? requestedHorizon
    : "12m";
  const [
    user,
    options,
    result,
    reporting,
    billing,
    freight,
    freightExpenses,
    relations,
    control,
  ] = await Promise.all([
    requireUser(),
    listProjectFormOptions(),
    getProject(projectId),
    getProjectReportingSnapshot(projectId, { horizon }),
    getProjectClientBillingSummary(projectId),
    getProjectFreightReconciliation(projectId),
    listProjectFreightExpenses(projectId),
    getProjectRelations(projectId),
    getProjectControl(projectId),
  ]);
  if (!result || !reporting) notFound();
  const { buildings, project } = result;
  const targets = calculateProjectTargets({
    defaultFreightMarkupRate: project.defaultFreightMarkupRate.toString(),
    defaultProductMarkupRate: project.defaultProductMarkupRate.toString(),
    estimatedFreightCostHt: projectFreightBudget(
      project.estimatedPurchaseCostHt?.toString(),
      project.freightEstimateRate?.toString(),
    ),
    estimatedPurchaseCostHt:
      project.estimatedPurchaseCostHt?.toString() ?? null,
    expectedSellHt: project.expectedSellHt?.toString() ?? null,
    targetMarkupRate: project.targetMarkupRate?.toString() ?? null,
    targetMode: project.targetMode,
  });
  const financialPerformance = calculateProjectFinancialPerformance({
    actualInvoicedHt: billing?.invoicedComplete ? billing.invoicedHt : null,
    actualOrderEconomicCostHt: reporting.financial.totals.economicLandedCost
      .complete
      ? reporting.financial.totals.economicLandedCost.value
      : null,
    projectFreightExpenseEconomicCostHt: freight?.projectExpenseEconomicCost
      .complete
      ? freight.projectExpenseEconomicCost.value
      : null,
    target: targets,
  });
  const deductibleInputVat = sumComparableFinancialAmounts(
    reporting.financial.totals.recoverableInputVat.complete
      ? reporting.financial.totals.recoverableInputVat.value
      : null,
    freight?.projectExpenseDeductibleInputVat.complete
      ? freight.projectExpenseDeductibleInputVat.value
      : null,
  );
  const vatPosition = calculateProjectVatPosition({
    deductibleInputVat,
    outputVat: billing?.outputVatComplete ? billing.outputVat : null,
  });
  const phase11CashPosition = calculateNetCashPosition(
    billing?.complete ? billing.paidTtc : null,
    sumComparableFinancialAmounts(
      reporting.payments.supplier.paid.complete
        ? reporting.payments.supplier.paid.value
        : null,
      reporting.freightPaid ?? (reporting.freightPaid === null ? null : "0"),
    ),
  );
  const fundingCoverage = calculateProjectFundingCoverage({
    clientBillingCoverageComplete: billing?.coverageComplete ?? false,
    clientBillingCoverageHt: billing?.coverageHt ?? "0",
    supplierOrders: reporting.orderRows.map((order) => ({
      id: order.id,
      sellingHt: order.salesRevenue,
      status: order.status,
    })),
  });
  return (
    <ProjectDetail
      buildings={buildings}
      canEdit={canEditMasterData(user.role)}
      clients={options.clients}
      currencies={options.currencies}
      workspace={{
        related: (
          <div className="space-y-4">
            <ProjectPaymentTerms
              projectId={project.id}
              canEdit={canEditMasterData(user.role)}
            />
            <RelatedRecords
              tables={relations.filter(
                (table) =>
                  ![
                    "payments",
                    "receipts",
                    "supplier-installments",
                    "client-installments",
                  ].includes(table.id),
              )}
              actions={
                canEditMasterData(user.role)
                  ? {
                      payments: (
                        <RelatedCashCreate
                          scope={{ kind: "project", id: project.id }}
                          kind="payment"
                        />
                      ),
                      receipts: (
                        <RelatedCashCreate
                          scope={{ kind: "project", id: project.id }}
                          kind="receipt"
                        />
                      ),
                      "supplier-installments": (
                        <RelatedCashCreate
                          scope={{ kind: "project", id: project.id }}
                          kind="supplier-installment"
                        />
                      ),
                      "client-installments": (
                        <RelatedCashCreate
                          scope={{ kind: "project", id: project.id }}
                          kind="client-installment"
                        />
                      ),
                    }
                  : {}
              }
            />
          </div>
        ),
        overview: (
          <div className="space-y-4">
            <ProjectFinancialDashboard
              section="overview"
              billing={billing}
              financialPerformance={financialPerformance}
              freight={freight}
              fundingCoverage={fundingCoverage}
              horizon={horizon}
              phase11CashPosition={phase11CashPosition}
              projectId={projectId}
              report={reporting}
              vatPosition={vatPosition}
            />
            <ProjectCoverage data={control} projectId={projectId} />
          </div>
        ),
        finance: (
          <div className="space-y-5">
            <ProjectFinancialControl data={control} />
            <ProjectFinancialDashboard
              section="finance"
              billing={billing}
              financialPerformance={financialPerformance}
              freight={freight}
              fundingCoverage={fundingCoverage}
              horizon={horizon}
              phase11CashPosition={phase11CashPosition}
              projectId={projectId}
              report={reporting}
              vatPosition={vatPosition}
            />
          </div>
        ),
        freightExpenses: (
          <div className="space-y-5">
            <ProjectFreightExpenses
              canEdit={canEditMasterData(user.role)}
              currencies={options.currencies}
              expenses={freightExpenses}
              projectId={projectId}
              reportingCurrencyCode={project.reportingCurrencyCode}
              suppliers={options.suppliers}
            />
            <ProjectFreightPayments
              projectId={projectId}
              canEdit={canEditMasterData(user.role)}
            />
          </div>
        ),
        budget: <ProjectPurchaseBudget projectId={projectId} />,
        packages: (
          <ProjectPackages
            projectId={projectId}
            currency={project.reportingCurrencyCode}
            canEdit={canEditMasterData(user.role)}
          />
        ),
        items: <RelatedItems projectId={projectId} />,
      }}
      managers={options.managers}
      project={{
        ...project,
        clientId: project.clientId ?? "",
        client: project.client ?? { id: "", displayName: "Unassigned" },
        clientBudgetTargetHt: project.clientBudgetTargetHt?.toString() ?? null,
        defaultFreightMarkupRate: project.defaultFreightMarkupRate.toString(),
        defaultOtherCostMarkupRate:
          project.defaultOtherCostMarkupRate.toString(),
        defaultProductMarkupRate: project.defaultProductMarkupRate.toString(),
        expectedCompletionDate:
          project.expectedCompletionDate?.toISOString() ?? null,
        freightEstimateRate: project.freightEstimateRate?.toString() ?? null,
        estimatedFreightCostHt: projectFreightBudget(
          project.estimatedPurchaseCostHt?.toString(),
          project.freightEstimateRate?.toString(),
        ),
        estimatedPurchaseCostHt:
          project.estimatedPurchaseCostHt?.toString() ?? null,
        expectedSellHt: project.expectedSellHt?.toString() ?? null,
        startDate: project.startDate?.toISOString() ?? null,
        targetMarkupRate: project.targetMarkupRate?.toString() ?? null,
      }}
      statuses={options.statuses}
    />
  );
}
