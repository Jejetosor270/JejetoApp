import "server-only";

import {
  Prisma,
  ProjectStatus,
  ProjectTargetMode,
} from "@/generated/prisma/client";
import { calculateProjectTargets } from "@/domain/projects/targets";
import type {
  CreateBuildingInput,
  CreateProjectInput,
  UpdateBuildingInput,
  UpdateProjectInput,
} from "@/domain/master-data/validation";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";
import { paginationSkip, type PageInput } from "@/domain/listing/validation";

import {
  InvalidMasterDataRelationError,
  MasterDataNotFoundError,
  ProjectReportingCurrencyLockedError,
} from "./errors";

const projectSelect = {
  _count: { select: { buildings: true, orders: true } },
  client: { select: { displayName: true, id: true } },
  clientBudgetTargetHt: true,
  defaultFreightMarkupRate: true,
  defaultOtherCostMarkupRate: true,
  defaultProductMarkupRate: true,
  clientId: true,
  code: true,
  countryCode: true,
  createdAt: true,
  expectedCompletionDate: true,
  estimatedFreightCostHt: true,
  estimatedPurchaseCostHt: true,
  expectedSellHt: true,
  freightEstimateNotes: true,
  freightEstimateRate: true,
  id: true,
  name: true,
  notes: true,
  projectManager: { select: { id: true, name: true } },
  projectManagerId: true,
  reportingCurrencyCode: true,
  startDate: true,
  status: true,
  targetMarkupRate: true,
  targetMode: true,
  updatedAt: true,
} satisfies Prisma.ProjectSelect;

const buildingSelect = {
  description: true,
  id: true,
  isActive: true,
  name: true,
  shortCode: true,
  rooms: {
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { code: true, id: true, isActive: true, name: true, notes: true },
  },
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
  const targetMode = ProjectTargetMode.MARKUP;
  const targets = calculateProjectTargets({
    defaultFreightMarkupRate: input.defaultFreightMarkupRate ?? null,
    defaultProductMarkupRate: input.defaultProductMarkupRate ?? null,
    estimatedFreightCostHt: input.estimatedFreightCostHt ?? null,
    estimatedPurchaseCostHt: input.estimatedPurchaseCostHt ?? null,
    expectedSellHt: input.expectedSellHt ?? null,
    targetMarkupRate: input.targetMarkupRate ?? null,
    targetMode,
  });
  return {
    clientBudgetTargetHt: input.clientBudgetTargetHt ?? null,
    clientId: input.clientId,
    defaultFreightMarkupRate: input.defaultFreightMarkupRate ?? "0",
    defaultOtherCostMarkupRate: input.defaultOtherCostMarkupRate ?? "0",
    defaultProductMarkupRate: input.defaultProductMarkupRate ?? "0",
    code: input.code,
    countryCode: input.countryCode ?? null,
    expectedCompletionDate: dateOrNull(input.expectedCompletionDate),
    estimatedFreightCostHt: input.estimatedFreightCostHt ?? null,
    estimatedPurchaseCostHt: input.estimatedPurchaseCostHt ?? null,
    expectedSellHt: targets.expectedSellHt,
    freightEstimateNotes: input.freightEstimateNotes ?? null,
    freightEstimateRate: input.freightEstimateRate ?? null,
    name: input.name,
    notes: input.notes ?? null,
    projectManagerId: input.projectManagerId ?? null,
    reportingCurrencyCode: input.reportingCurrencyCode,
    startDate: dateOrNull(input.startDate),
    status: input.status,
    targetMarkupRate: targets.effectiveMarkupRate,
    targetMode,
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

export interface ProjectListFilters extends PageInput {
  clientId?: string | undefined;
  countryCode?: string | undefined;
  currencyCode?: string | undefined;
  direction: "asc" | "desc";
  managerId?: string | undefined;
  query: string;
  sort: "code" | "created" | "name" | "status" | "updated";
  status?: ProjectStatus | undefined;
}

export async function listProjects(filters: ProjectListFilters) {
  const normalizedQuery = filters.query.trim();
  const where: Prisma.ProjectWhereInput = {
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.managerId ? { projectManagerId: filters.managerId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.countryCode ? { countryCode: filters.countryCode } : {}),
    ...(filters.currencyCode
      ? { reportingCurrencyCode: filters.currencyCode }
      : {}),
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
  };
  const orderBy: Prisma.ProjectOrderByWithRelationInput[] =
    filters.sort === "code"
      ? [{ code: filters.direction }, { id: "asc" }]
      : filters.sort === "created"
        ? [{ createdAt: filters.direction }, { id: "asc" }]
        : filters.sort === "status"
          ? [{ status: filters.direction }, { name: "asc" }, { id: "asc" }]
          : filters.sort === "updated"
            ? [{ updatedAt: filters.direction }, { id: "asc" }]
            : [{ name: filters.direction }, { id: "asc" }];
  const database = getDatabase();
  const [items, total] = await Promise.all([
    database.project.findMany({
      orderBy,
      select: projectSelect,
      skip: paginationSkip(filters),
      take: filters.pageSize,
      where,
    }),
    database.project.count({ where }),
  ]);
  return { items, total };
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
  return getDatabase().$transaction(async (transaction) => {
    const project = await transaction.project.create({
      data: {
        ...projectData(input),
        createdById: actorId,
        updatedById: actorId,
      },
      select: projectSelect,
    });
    await writeAuditEvent(transaction, actorId, {
      action: "CREATED",
      entityId: project.id,
      entityReference: project.code,
      entityType: "PROJECT",
      summary: "Created the Project.",
    });
    return project;
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
        const project = await transaction.project.update({
          where: { id },
          data: { ...projectData(fields), updatedById: actorId },
          select: projectSelect,
        });
        await writeAuditEvent(transaction, actorId, {
          action: "UPDATED",
          entityId: project.id,
          entityReference: project.code,
          entityType: "PROJECT",
          metadata: {
            changedFields: [
              "project details",
              "financial targets",
              "defaultProductMarkupRate",
              "defaultFreightMarkupRate",
              "defaultOtherCostMarkupRate",
            ],
          },
          summary: "Updated the Project and its financial targets.",
        });
        return project;
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
  return getDatabase().$transaction(async (transaction) => {
    const building = await transaction.building.create({
      data: {
        ...buildingData(input),
        projectId: input.projectId,
        createdById: actorId,
        updatedById: actorId,
      },
      select: buildingSelect,
    });
    await writeAuditEvent(transaction, actorId, {
      action: "CREATED",
      entityId: building.id,
      entityReference: building.shortCode,
      entityType: "BUILDING",
      summary: "Created the Building.",
    });
    return building;
  });
}

export async function updateBuilding(
  actorId: string,
  input: UpdateBuildingInput,
): Promise<ManagedBuilding> {
  const { id, isActive, ...fields } = input;
  try {
    return await getDatabase().$transaction(async (transaction) => {
      const building = await transaction.building.update({
        where: { id },
        data: { ...buildingData(fields), isActive, updatedById: actorId },
        select: buildingSelect,
      });
      await writeAuditEvent(transaction, actorId, {
        action: "UPDATED",
        entityId: building.id,
        entityReference: building.shortCode,
        entityType: "BUILDING",
        metadata: { active: building.isActive },
        summary: "Updated the Building.",
      });
      return building;
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
