import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectDetail } from "@/app/(app)/projects/[projectId]/project-detail";
import { ProjectFinancialDashboard } from "@/components/reporting/project-financial-dashboard";
import { isCashFlowHorizon, type CashFlowHorizon } from "@/config/reporting";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listProjectFormOptions } from "@/lib/master-data/lookups";
import { getProject } from "@/lib/master-data/projects";
import { projectItemSummary } from "@/lib/items/items";
import { formatMoney } from "@/domain/procurement/presentation";
import { getProjectReportingSnapshot } from "@/lib/reporting/reports";
import { getApplicationSettings } from "@/lib/settings/application-settings";
import { getProjectClientBillingSummary } from "@/lib/billing/billing";
import { ProjectFreightExpenses } from "@/components/freight/project-freight-expenses";
import {
  getProjectFreightReconciliation,
  listProjectFreightExpenses,
} from "@/lib/freight/expenses";
import {
  calculateProjectActualProfitability,
  calculateProjectTargets,
  calculateNetCashPosition,
  financialVariance,
} from "@/domain/projects/targets";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ horizon?: string }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const requestedHorizon = query.horizon ?? "";
  const horizon: CashFlowHorizon = isCashFlowHorizon(requestedHorizon)
    ? requestedHorizon
    : "12m";
  const settings = await getApplicationSettings();
  const [
    user,
    options,
    result,
    reporting,
    itemSummary,
    billing,
    freight,
    freightExpenses,
  ] = await Promise.all([
    requireUser(),
    listProjectFormOptions(),
    getProject(projectId),
    getProjectReportingSnapshot(projectId, { horizon }),
    settings.itemManagementEnabled
      ? projectItemSummary(projectId)
      : Promise.resolve(null),
    getProjectClientBillingSummary(projectId),
    getProjectFreightReconciliation(projectId),
    listProjectFreightExpenses(projectId),
  ]);
  if (!result || !reporting) notFound();
  const { buildings, project } = result;
  const targets = calculateProjectTargets({
    defaultFreightMarkupRate: project.defaultFreightMarkupRate.toString(),
    defaultProductMarkupRate: project.defaultProductMarkupRate.toString(),
    estimatedFreightCostHt: project.estimatedFreightCostHt?.toString() ?? null,
    estimatedPurchaseCostHt:
      project.estimatedPurchaseCostHt?.toString() ?? null,
    expectedSellHt: project.expectedSellHt?.toString() ?? null,
    targetMarkupRate: project.targetMarkupRate?.toString() ?? null,
    targetMode: project.targetMode,
  });
  const actualProfitability = calculateProjectActualProfitability(
    reporting.financial.complete
      ? reporting.financial.totals.economicLandedCost.value
      : null,
    billing?.complete ? billing.invoicedHt : null,
  );
  const phase11CashPosition = calculateNetCashPosition(
    billing?.complete ? billing.paidTtc : null,
    reporting.payments.supplier.paid.complete
      ? reporting.payments.supplier.paid.value
      : null,
  );
  const targetVariances = {
    cost: financialVariance(
      reporting.financial.complete
        ? reporting.financial.totals.economicLandedCost.value
        : null,
      targets.estimatedCostHt,
    ),
    markup: financialVariance(
      actualProfitability.markupRate,
      targets.targetMarkupRate,
    ),
    sell: financialVariance(
      billing?.complete ? billing.invoicedHt : null,
      project.clientBudgetTargetHt?.toString() ?? targets.expectedSellHt,
    ),
  };
  return (
    <ProjectDetail
      buildings={buildings}
      canEdit={canEditMasterData(user.role)}
      clients={options.clients}
      currencies={options.currencies}
      financialDashboard={
        <>
          {itemSummary ? (
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Items</p>
                <p className="mt-1 text-xl font-semibold">
                  {itemSummary.count}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">
                  Item purchase HT
                </p>
                <p className="financial-figure mt-1 font-semibold">
                  {formatMoney(
                    itemSummary.purchase,
                    project.reportingCurrencyCode,
                  )}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Item selling HT</p>
                <p className="financial-figure mt-1 font-semibold">
                  {formatMoney(
                    itemSummary.selling,
                    project.reportingCurrencyCode,
                  )}
                </p>
              </div>
            </section>
          ) : null}
          <ProjectFinancialDashboard
            actualProfitability={actualProfitability}
            billing={billing}
            clientBudgetTargetHt={
              project.clientBudgetTargetHt?.toString() ?? null
            }
            freight={freight}
            horizon={horizon}
            phase11CashPosition={phase11CashPosition}
            projectId={projectId}
            report={reporting}
            targets={targets}
            variances={targetVariances}
          />
          <ProjectFreightExpenses
            canEdit={canEditMasterData(user.role)}
            currencies={options.currencies}
            expenses={freightExpenses}
            projectId={projectId}
            reportingCurrencyCode={project.reportingCurrencyCode}
            suppliers={options.suppliers}
          />
        </>
      }
      managers={options.managers}
      project={{
        ...project,
        clientBudgetTargetHt: project.clientBudgetTargetHt?.toString() ?? null,
        defaultFreightMarkupRate: project.defaultFreightMarkupRate.toString(),
        defaultOtherCostMarkupRate:
          project.defaultOtherCostMarkupRate.toString(),
        defaultProductMarkupRate: project.defaultProductMarkupRate.toString(),
        expectedCompletionDate:
          project.expectedCompletionDate?.toISOString() ?? null,
        freightEstimateRate: project.freightEstimateRate?.toString() ?? null,
        estimatedFreightCostHt:
          project.estimatedFreightCostHt?.toString() ?? null,
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
