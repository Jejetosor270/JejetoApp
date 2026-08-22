import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectDetail } from "@/app/(app)/projects/[projectId]/project-detail";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listProjectFormOptions } from "@/lib/master-data/lookups";
import { getProject } from "@/lib/master-data/projects";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [user, options, result] = await Promise.all([
    requireUser(),
    listProjectFormOptions(),
    getProject(projectId),
  ]);
  if (!result) notFound();
  const { buildings, project } = result;
  return (
    <ProjectDetail
      buildings={buildings}
      canEdit={canEditMasterData(user.role)}
      clients={options.clients}
      currencies={options.currencies}
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
