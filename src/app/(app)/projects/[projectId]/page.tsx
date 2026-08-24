import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectDetail } from "@/app/(app)/projects/[projectId]/project-detail";
import { ProjectFinancialDashboard } from "@/components/reporting/project-financial-dashboard";
import { isCashFlowHorizon, type CashFlowHorizon } from "@/config/reporting";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listProjectFormOptions } from "@/lib/master-data/lookups";
import { getProject } from "@/lib/master-data/projects";
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
  const [user, options, result, reporting] = await Promise.all([
    requireUser(),
    listProjectFormOptions(),
    getProject(projectId),
    getProjectReportingSnapshot(projectId, { horizon }),
  ]);
  if (!result || !reporting) notFound();
  const { buildings, project } = result;
  return (
    <ProjectDetail
      buildings={buildings}
      canEdit={canEditMasterData(user.role)}
      clients={options.clients}
      currencies={options.currencies}
      financialDashboard={
        <ProjectFinancialDashboard
          horizon={horizon}
          projectId={projectId}
          report={reporting}
        />
      }
      managers={options.managers}
      project={{
        ...project,
        expectedCompletionDate:
          project.expectedCompletionDate?.toISOString() ?? null,
        startDate: project.startDate?.toISOString() ?? null,
      }}
      statuses={options.statuses}
    />
  );
}
