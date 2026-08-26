import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => {
  const transaction = {
    building: { create: vi.fn(), update: vi.fn() },
    project: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  };
  return {
    database: {
      building: { create: vi.fn() },
      client: { findFirst: vi.fn() },
      currency: { findFirst: vi.fn() },
      project: { create: vi.fn(), findUnique: vi.fn() },
      user: { findFirst: vi.fn() },
      $transaction: vi.fn(
        async (callback: (value: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    },
    transaction,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => databaseMocks.database }));
vi.mock("@/lib/audit/events", () => ({ writeAuditEvent: vi.fn() }));

import {
  createBuilding,
  createProject,
  getProject,
  updateProject,
} from "@/lib/master-data/projects";

const actorId = "d1ba89a0-c7d0-4657-a922-80cdf9f9b94e";
const clientId = "f45ac9c9-10e9-4e42-b93f-38796de4f65a";
const projectId = "a12b6b9b-10e9-4e42-b93f-38796de4f65a";
const managerId = "b12b6b9b-10e9-4e42-b93f-38796de4f65a";

describe("project and building writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies the client, currency, and manager before attributing project creation", async () => {
    databaseMocks.database.client.findFirst.mockResolvedValue({ id: clientId });
    databaseMocks.database.currency.findFirst.mockResolvedValue({
      code: "EUR",
    });
    databaseMocks.database.user.findFirst.mockResolvedValue({ id: managerId });
    databaseMocks.transaction.project.create.mockResolvedValue({
      code: "PRJ-001",
      id: projectId,
    });

    await createProject(actorId, {
      clientId,
      code: "PRJ-001",
      name: "Example Project",
      projectManagerId: managerId,
      reportingCurrencyCode: "EUR",
      status: "PLANNING",
    });

    expect(databaseMocks.database.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: clientId, isActive: true } }),
    );
    expect(databaseMocks.database.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: managerId, isActive: true } }),
    );
    expect(databaseMocks.transaction.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: actorId,
          projectManagerId: managerId,
          updatedById: actorId,
        }),
      }),
    );
  });

  it("requires a valid project and attributes building creation to the actor", async () => {
    databaseMocks.database.project.findUnique.mockResolvedValue({
      id: projectId,
    });
    databaseMocks.transaction.building.create.mockResolvedValue({
      id: "c12b6b9b-10e9-4e42-b93f-38796de4f65a",
      name: "Building A",
    });

    await createBuilding(actorId, {
      name: "Building A",
      projectId,
      shortCode: "A",
    });

    expect(databaseMocks.transaction.building.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: actorId,
          projectId,
          updatedById: actorId,
        }),
      }),
    );
  });

  it("allows a reporting-currency change before the Project has Orders", async () => {
    databaseMocks.database.client.findFirst.mockResolvedValue({ id: clientId });
    databaseMocks.database.currency.findFirst.mockResolvedValue({
      code: "GBP",
    });
    databaseMocks.transaction.project.findUnique.mockResolvedValue({
      _count: { orders: 0 },
      reportingCurrencyCode: "EUR",
    });
    databaseMocks.transaction.project.update.mockResolvedValue({
      id: projectId,
    });

    await updateProject(actorId, {
      clientId,
      code: "PRJ-001",
      id: projectId,
      name: "Example Project",
      reportingCurrencyCode: "GBP",
      status: "PLANNING",
    });

    expect(databaseMocks.transaction.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reportingCurrencyCode: "GBP" }),
      }),
    );
  });

  it("marks reporting currency as locked for the normal editor after an Order exists", async () => {
    databaseMocks.database.project.findUnique.mockResolvedValue({
      _count: { orders: 1 },
      buildings: [],
      id: projectId,
      reportingCurrencyCode: "EUR",
    });

    const result = await getProject(projectId);

    expect(result?.project.reportingCurrencyLocked).toBe(true);
  });

  it("rejects a reporting-currency change after the Project has an Order", async () => {
    databaseMocks.database.client.findFirst.mockResolvedValue({ id: clientId });
    databaseMocks.database.currency.findFirst.mockResolvedValue({
      code: "GBP",
    });
    databaseMocks.transaction.project.findUnique.mockResolvedValue({
      _count: { orders: 1 },
      reportingCurrencyCode: "EUR",
    });

    await expect(
      updateProject(actorId, {
        clientId,
        code: "PRJ-001",
        id: projectId,
        name: "Example Project",
        reportingCurrencyCode: "GBP",
        status: "ACTIVE",
      }),
    ).rejects.toThrow("historical FX rates and reporting values depend on it");
    expect(databaseMocks.transaction.project.update).not.toHaveBeenCalled();
  });

  it("allows other Project edits when its reporting currency stays unchanged", async () => {
    databaseMocks.database.client.findFirst.mockResolvedValue({ id: clientId });
    databaseMocks.database.currency.findFirst.mockResolvedValue({
      code: "EUR",
    });
    databaseMocks.transaction.project.findUnique.mockResolvedValue({
      _count: { orders: 2 },
      reportingCurrencyCode: "EUR",
    });
    databaseMocks.transaction.project.update.mockResolvedValue({
      id: projectId,
    });

    await updateProject(actorId, {
      clientId,
      code: "PRJ-001",
      id: projectId,
      name: "Renamed Project",
      reportingCurrencyCode: "EUR",
      status: "ACTIVE",
    });

    expect(databaseMocks.transaction.project.update).toHaveBeenCalledOnce();
  });
});
