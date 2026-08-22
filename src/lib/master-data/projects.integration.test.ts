import { describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => ({
  building: { create: vi.fn() },
  client: { findFirst: vi.fn() },
  currency: { findFirst: vi.fn() },
  project: { create: vi.fn(), findUnique: vi.fn() },
  user: { findFirst: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: () => databaseMocks }));

import { createBuilding, createProject } from "@/lib/master-data/projects";

const actorId = "d1ba89a0-c7d0-4657-a922-80cdf9f9b94e";
const clientId = "f45ac9c9-10e9-4e42-b93f-38796de4f65a";
const projectId = "a12b6b9b-10e9-4e42-b93f-38796de4f65a";
const managerId = "b12b6b9b-10e9-4e42-b93f-38796de4f65a";

describe("project and building writes", () => {
  it("verifies the client, currency, and manager before attributing project creation", async () => {
    databaseMocks.client.findFirst.mockResolvedValue({ id: clientId });
    databaseMocks.currency.findFirst.mockResolvedValue({ code: "EUR" });
    databaseMocks.user.findFirst.mockResolvedValue({ id: managerId });
    databaseMocks.project.create.mockResolvedValue({ id: projectId });

    await createProject(actorId, {
      clientId,
      code: "PRJ-001",
      name: "Example Project",
      projectManagerId: managerId,
      reportingCurrencyCode: "EUR",
      status: "PLANNING",
    });

    expect(databaseMocks.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: clientId, isActive: true } }),
    );
    expect(databaseMocks.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: managerId, isActive: true } }),
    );
    expect(databaseMocks.project.create).toHaveBeenCalledWith(
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
    databaseMocks.project.findUnique.mockResolvedValue({ id: projectId });
    databaseMocks.building.create.mockResolvedValue({
      id: "c12b6b9b-10e9-4e42-b93f-38796de4f65a",
    });

    await createBuilding(actorId, {
      name: "Building A",
      projectId,
      shortCode: "A",
    });

    expect(databaseMocks.building.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: actorId,
          projectId,
          updatedById: actorId,
        }),
      }),
    );
  });
});
