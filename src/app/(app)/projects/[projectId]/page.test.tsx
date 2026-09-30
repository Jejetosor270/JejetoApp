import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  project: vi.fn(),
  financial: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("PROJECT_NOT_FOUND");
  },
  redirect: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireUser: mocks.user,
  canEditMasterData: vi.fn(),
}));
vi.mock("@/lib/master-data/projects", () => ({ getProject: mocks.project }));
vi.mock("@/lib/reporting/project-control", () => ({
  getProjectControl: mocks.financial,
}));
import ProjectPage from "./page";
const params = Promise.resolve({
  projectId: "11111111-1111-4111-8111-111111111111",
});
beforeEach(() => {
  vi.resetAllMocks();
});
it("does not start financial reads when the Project is missing or trashed", async () => {
  mocks.user.mockResolvedValue({ id: "actor", role: "MANAGER" });
  mocks.project.mockResolvedValue(null);
  await expect(
    ProjectPage({ params, searchParams: Promise.resolve({}) }),
  ).rejects.toThrow("PROJECT_NOT_FOUND");
  expect(mocks.financial).not.toHaveBeenCalled();
});
it("resolves authentication before reading the Project", async () => {
  mocks.user.mockRejectedValue(new Error("Sign in required"));
  await expect(
    ProjectPage({ params, searchParams: Promise.resolve({}) }),
  ).rejects.toThrow("Sign in required");
  expect(mocks.project).not.toHaveBeenCalled();
  expect(mocks.financial).not.toHaveBeenCalled();
});
