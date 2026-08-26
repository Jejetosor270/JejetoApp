import "server-only";

import { Prisma, ProjectStatus } from "@/generated/prisma/client";
import type {
  CreateBuildingInput,
  CreateProjectInput,
  UpdateBuildingInput,
  UpdateProjectInput,
} from "@/domain/master-data/validation";
import { getDatabase } from "@/lib/db";

import {
  InvalidMasterDataRelationError,
  MasterDataNotFoundError,
  ProjectReportingCurrencyLockedError,
} from "./errors";

const projectSelect = {
  _count: { select: { buildings: true, orders: true } },
  client: { select: { displayName: true, id: true } },
  clientId: true,
  code: true,
  countryCode: true,
  expectedCompletionDate: true,
  id: true,
  name: true,
  notes: true,
  projectManager: { select: { id: true, name: true } },
  projectManagerId: true,
  reportingCurrencyCode: true,
  startDate: true,
  status: true,
} satisfies Prisma.ProjectSelect;

const buildingSelect = {
  description: true,
  id: true,
  isActive: true,
  name: true,
  shortCode: true,
} satisfies Prisma.BuildingSelect;

export type ManagedProject = Prisma.ProjectGetPayload<{
  select: typeof projectSelect;
}>;
export type ManagedBuilding = Prisma.BuildingGetPayload<{
  select: typeof buildingSelect;
}>;
export type ManagedProjectDetail = ManagedProject & {
  reportingCurrencyLocked: boolean;
};

function dateOrNull(value: string | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function projectData(input: CreateProjectInput) {
  return {
    clientId: input.clientId,
    code: input.code,
    countryCode: input.countryCode ?? null,
    expectedCompletionDate: dateOrNull(input.expectedCompletionDate),
    name: input.name,
    notes: input.notes ?? null,
    projectManagerId: input.projectManagerId ?? null,
    reportingCurrencyCode: input.reportingCurrencyCode,
    startDate: dateOrNull(input.startDate),
    status: input.status,
  };
}

function buildingData(input: Omit<CreateBuildingInput, "projectId">) {
  return {
    description: input.description ?? null,
    name: input.name,
    shortCode: input.shortCode,
  };
}

async function assertProjectRelations(
  input: CreateProjectInput,
): Promise<void> {
  const database = getDatabase();
  const [client, currency, manager] = await Promise.all([
    database.client.findFirst({
      where: { id: input.clientId, isActive: true },
      select: { id: true },
    }),
    database.currency.findFirst({
      where: { code: input.reportingCurrencyCode, isActive: true },
      select: { code: true },
    }),
    input.projectManagerId
      ? database.user.findFirst({
          where: { id: input.projectManagerId, isActive: true },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (!client)
    throw new InvalidMasterDataRelationError("Choose an active client.");
  if (!currency)
    throw new InvalidMasterDataRelationError(
      "Choose an active reporting currency.",
    );
  if (input.projectManagerId && !manager)
    throw new InvalidMasterDataRelationError(
      "Choose an active project manager.",
    );
}

export async function listProjects(filters: {
  clientId?: string | undefined;
  managerId?: string | undefined;
  query: string;
  status?: ProjectStatus | undefined;
}) {
  const normalizedQuery = filters.query.trim();
  return getDatabase().project.findMany({
    where: {
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.managerId ? { projectManagerId: filters.managerId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(normalizedQuery
        ? {
            OR: [
              { name: { contains: normalizedQuery, mode: "insensitive" } },
              { code: { contains: normalizedQuery, mode: "insensitive" } },
              {
                client: {
                  displayName: {
                    contains: normalizedQuery,
                    mode: "insensitive",
                  },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: projectSelect,
  });
}

export async function getProject(projectId: string): Promise<{
  buildings: ManagedBuilding[];
  project: ManagedProjectDetail;
} | null> {
  const project = await getDatabase().project.findUnique({
    where: { id: projectId },
    select: {
      ...projectSelect,
      buildings: {
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        select: buildingSelect,
      },
    },
  });
  if (!project) return null;
  const { buildings, ...projectFields } = project;
  return {
    buildings,
    project: {
      ...projectFields,
      reportingCurrencyLocked: projectFields._count.orders > 0,
    },
  };
}

export async function createProject(
  actorId: string,
  input: CreateProjectInput,
): Promise<ManagedProject> {
  await assertProjectRelations(input);
  return getDatabase().project.create({
    data: { ...projectData(input), createdById: actorId, updatedById: actorId },
    select: projectSelect,
  });
}

export async function updateProject(
  actorId: string,
  input: UpdateProjectInput,
): Promise<ManagedProject> {
  const { id, ...fields } = input;
  await assertProjectRelations(fields);
  try {
    return await getDatabase().$transaction(
      async (transaction) => {
        const current = await transaction.project.findUnique({
          where: { id },
          select: {
            _count: { select: { orders: true } },
            reportingCurrencyCode: true,
          },
        });
        if (!current) {
          throw new MasterDataNotFoundError("This project no longer exists.");
        }
        if (
          current.reportingCurrencyCode !== fields.reportingCurrencyCode &&
          current._count.orders > 0
        ) {
          throw new ProjectReportingCurrencyLockedError();
        }
        return transaction.project.update({
          where: { id },
          data: { ...projectData(fields), updatedById: actorId },
          select: projectSelect,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new MasterDataNotFoundError("This project no longer exists.");
    }
    throw error;
  }
}

export async function createBuilding(
  actorId: string,
  input: CreateBuildingInput,
): Promise<ManagedBuilding> {
  const project = await getDatabase().project.findUnique({
    where: { id: input.projectId },
    select: { id: true },
  });
  if (!project)
    throw new InvalidMasterDataRelationError("Choose a valid project.");
  return getDatabase().building.create({
    data: {
      ...buildingData(input),
      projectId: input.projectId,
      createdById: actorId,
      updatedById: actorId,
    },
    select: buildingSelect,
  });
}

export async function updateBuilding(
  actorId: string,
  input: UpdateBuildingInput,
): Promise<ManagedBuilding> {
  const { id, isActive, ...fields } = input;
  try {
    return await getDatabase().building.update({
      where: { id },
      data: { ...buildingData(fields), isActive, updatedById: actorId },
      select: buildingSelect,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new MasterDataNotFoundError("This building no longer exists.");
    }
    throw error;
  }
}
