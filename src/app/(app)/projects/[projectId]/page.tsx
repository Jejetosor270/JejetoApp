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
import { projectFreightEstimate } from "@/domain/items/calculations";
import { getProjectReportingSnapshot } from "@/lib/reporting/reports";

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
  const [user, options, result, reporting, itemSummary] = await Promise.all([
    requireUser(),
    listProjectFormOptions(),
    getProject(projectId),
    getProjectReportingSnapshot(projectId, { horizon }),
    projectItemSummary(projectId),
  ]);
  if (!result || !reporting) notFound();
  const { buildings, project } = result;
  const estimatedFreight = itemSummary.purchase
    ? projectFreightEstimate(
        itemSummary.purchase,
        project.freightEstimateRate?.toString() ?? null,
      )
    : null;
  return (
    <ProjectDetail
      buildings={buildings}
      canEdit={canEditMasterData(user.role)}
      clients={options.clients}
      currencies={options.currencies}
      financialDashboard={
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">Items</p>
              <p className="mt-1 text-xl font-semibold">{itemSummary.count}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">Item purchase HT</p>
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
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">
                Estimated Project freight
              </p>
              <p className="financial-figure mt-1 font-semibold">
                {formatMoney(estimatedFreight, project.reportingCurrencyCode)}
              </p>
            </div>
          </section>
          <ProjectFinancialDashboard
            horizon={horizon}
            projectId={projectId}
            report={reporting}
          />
        </>
      }
      managers={options.managers}
      project={{
        ...project,
        expectedCompletionDate:
          project.expectedCompletionDate?.toISOString() ?? null,
        freightEstimateRate: project.freightEstimateRate?.toString() ?? null,
        startDate: project.startDate?.toISOString() ?? null,
      }}
      statuses={options.statuses}
    />
  );
}
