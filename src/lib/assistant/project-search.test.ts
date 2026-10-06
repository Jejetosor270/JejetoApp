import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ project: vi.fn(), db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDatabase: mocks.db }));
import {
  searchAssistantProjects,
  suggestAssistantProjects,
} from "./project-search";

function project(id = "bled", name = "Villas Bled") {
  return {
    id,
    name,
    code: "VB-1",
    client: { displayName: "Fictional Client" },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.project.mockResolvedValue([]);
  mocks.db.mockReturnValue({ project: { findMany: mocks.project } });
});

describe("JejetoBot Project search", () => {
  it("prefers literal exact matches without loading partials or a catalog", async () => {
    mocks.project
      .mockResolvedValueOnce([project("exact", "Villa Bled")])
      .mockResolvedValueOnce([project("partial", "Villa Bled North")]);
    const found = await searchAssistantProjects(" Villa Bled ");
    expect(found.results.map((result) => result.id)).toEqual(["exact"]);
    expect(found.requiresConfirmation).toBeUndefined();
    expect(mocks.project).toHaveBeenCalledTimes(1);
    expect(mocks.project).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        take: 11,
        where: {
          id: { notIn: [] },
          OR: [
            { name: { equals: "Villa Bled", mode: "insensitive" } },
            { code: { equals: "Villa Bled", mode: "insensitive" } },
          ],
        },
      }),
    );
  });

  it("finds villa bled as Villas Bled using bounded fallback", async () => {
    mocks.project
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([project()]);
    const found = await searchAssistantProjects("villa bled");
    expect(found).toEqual({
      results: [
        {
          id: "bled",
          type: "Project",
          label: "Villas Bled",
          context: "VB-1 · Fictional Client",
          href: "/projects/bled",
        },
      ],
      truncated: false,
    });
    expect(mocks.project).toHaveBeenNthCalledWith(3, {
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 501,
      select: {
        id: true,
        name: true,
        code: true,
        client: { select: { displayName: true } },
      },
    });
  });

  it("does not let a literal substring hide the normalized full name", async () => {
    const annex = project("annex", "Villa Bled Annex");
    mocks.project
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([annex])
      .mockResolvedValueOnce([annex, project()]);
    const found = await searchAssistantProjects("villa bled");
    expect(found.results.map((result) => result.id)).toEqual(["bled", "annex"]);
    expect(found.requiresConfirmation).toBe(true);
  });

  it.each(["Villa 1", "P-1"])(
    "rejects unsafe numeric substring %s even without fallback",
    async (query) => {
      const wrong = { ...project("wrong", "Villa 10"), code: "P-10" };
      mocks.project.mockResolvedValueOnce([]).mockResolvedValueOnce([wrong]);
      expect(
        await searchAssistantProjects(query, { allowSuggestions: false }),
      ).toEqual({ results: [], truncated: false });
      expect(mocks.project).toHaveBeenCalledTimes(2);
    },
  );

  it("requires confirmation for a sole literal partial match", async () => {
    const partial = project("annex", "Villa Bled Annex");
    mocks.project
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([partial])
      .mockResolvedValueOnce([partial]);
    expect(await searchAssistantProjects("Villa Bled")).toMatchObject({
      results: [{ id: "annex" }],
      requiresConfirmation: true,
    });
  });

  it("requires confirmation for a unique typo suggestion", async () => {
    mocks.project
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([project()]);
    expect(await searchAssistantProjects("villa beld")).toMatchObject({
      results: [{ id: "bled" }],
      truncated: false,
      requiresConfirmation: true,
    });
  });

  it("keeps multiple normalized Projects for explicit selection", async () => {
    mocks.project
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        project("first"),
        project("second", "Villa Bléd"),
      ]);
    expect((await searchAssistantProjects("villa bled")).results).toHaveLength(
      2,
    );
  });

  it("never claims a unique Project from an incomplete catalog", async () => {
    mocks.project.mockResolvedValue([
      project(),
      ...Array.from({ length: 500 }, (_, index) =>
        project(`unrelated-${index}`, `Unrelated ${index}`),
      ),
    ]);
    expect(await suggestAssistantProjects("villa bled")).toMatchObject({
      results: [{ id: "bled" }],
      truncated: true,
    });
    expect(mocks.project).toHaveBeenCalledTimes(1);
  });

  it("does not pretend an unsearched catalog suffix had no matches", async () => {
    mocks.project.mockResolvedValue(
      Array.from({ length: 501 }, (_, index) =>
        project(`unrelated-${index}`, `Unrelated ${index}`),
      ),
    );
    expect(await suggestAssistantProjects("villa bled")).toEqual({
      results: [],
      truncated: true,
    });
  });

  it("limits displayed matches independently of the bounded catalog", async () => {
    mocks.project.mockResolvedValue(
      Array.from({ length: 15 }, (_, index) => project(`bled-${index}`)),
    );
    const found = await suggestAssistantProjects("villa bled");
    expect(found.results).toHaveLength(10);
    expect(found.truncated).toBe(true);
  });

  it("does not load partial or catalog reads if exact matches already exceed the cap", async () => {
    mocks.project.mockResolvedValueOnce(
      Array.from({ length: 11 }, (_, index) => project(`bled-${index}`)),
    );
    const found = await searchAssistantProjects("Villas Bled");
    expect(found.truncated).toBe(true);
    expect(found.results).toHaveLength(10);
    expect(mocks.project).toHaveBeenCalledTimes(1);
  });

  it("uses shared visible records only and selects no financial or secret fields", async () => {
    await suggestAssistantProjects("Villa Bled");
    expect(mocks.db).toHaveBeenCalled();
    expect(mocks.project).toHaveBeenCalledExactlyOnceWith({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 501,
      select: {
        id: true,
        name: true,
        code: true,
        client: { select: { displayName: true } },
      },
    });
  });

  it("encodes application-owned record paths", async () => {
    mocks.project.mockResolvedValue([project("unsafe/id?query")]);
    expect(
      (await suggestAssistantProjects("villa bled")).results[0]?.href,
    ).toBe("/projects/unsafe%2Fid%3Fquery");
  });

  it.each(["", "a", "x".repeat(101)])(
    "rejects invalid query input before reads",
    async (query) => {
      await expect(searchAssistantProjects(query)).rejects.toThrow();
      await expect(suggestAssistantProjects(query)).rejects.toThrow();
      expect(mocks.db).not.toHaveBeenCalled();
    },
  );
});
