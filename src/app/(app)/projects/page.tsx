import type { Metadata } from "next";

import { ProjectManagement } from "@/app/(app)/projects/project-management";
import { ProjectStatus } from "@/generated/prisma/client";
import { canEditMasterData, requireUser } from "@/lib/auth/current-user";
import { listProjectFormOptions } from "@/lib/master-data/lookups";
import { listProjects } from "@/lib/master-data/projects";

export const metadata: Metadata = { title: "Projects" };

function enumValue(value: string | undefined): ProjectStatus | undefined {
  return Object.values(ProjectStatus).find((status) => status === value);
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    clientId?: string;
    managerId?: string;
    query?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;
  const query = typeof params.query === "string" ? params.query : "";
  const clientId =
    typeof params.clientId === "string" && params.clientId
      ? params.clientId
      : undefined;
  const managerId =
    typeof params.managerId === "string" && params.managerId
      ? params.managerId
      : undefined;
  const status = enumValue(
    typeof params.status === "string" ? params.status : undefined,
  );
  const [user, options, projects] = await Promise.all([
    requireUser(),
    listProjectFormOptions(),
    listProjects({ clientId, managerId, query, status }),
  ]);
  return (
    <div className="space-y-6">
      <header>
        <p className="text-primary text-xs font-medium tracking-[0.08em] uppercase">
          Workspace
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Client projects and their buildings.
        </p>
      </header>
      <form className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <input
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={query}
          name="query"
          placeholder="Search project, code, or client"
        />
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={clientId ?? ""}
          name="clientId"
        >
          <option value="">All clients</option>
          {options.clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.displayName}
            </option>
          ))}
        </select>
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={status ?? ""}
          name="status"
        >
          <option value="">All statuses</option>
          {options.statuses.map((item) => (
            <option key={item} value={item}>
              {item.replace("_", " ")}
            </option>
          ))}
        </select>
        <select
          className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
          defaultValue={managerId ?? ""}
          name="managerId"
        >
          <option value="">All managers</option>
          {options.managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.name}
            </option>
          ))}
        </select>
        <button
          className="border-input h-9 rounded-lg border px-3 text-sm font-medium"
          type="submit"
        >
          Filter
        </button>
      </form>
      <ProjectManagement
        canEdit={canEditMasterData(user.role)}
        clients={options.clients}
        currencies={options.currencies}
        managers={options.managers}
        projects={projects.map((project) => ({
          ...project,
          expectedCompletionDate:
            project.expectedCompletionDate?.toISOString() ?? null,
        }))}
        statuses={options.statuses}
      />
    </div>
  );
}
