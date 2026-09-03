import { beforeEach, describe, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => cache);

import { revalidateProjectFinancialViews } from "./revalidation";

describe("Project financial view revalidation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refreshes one known Project plus shared reporting views", () => {
    revalidateProjectFinancialViews("project-1");

    expect(cache.revalidatePath).toHaveBeenCalledWith("/projects/project-1");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/reports");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("refreshes every Project detail when a mutation lacks Project context", () => {
    revalidateProjectFinancialViews();

    expect(cache.revalidatePath).toHaveBeenCalledWith(
      "/projects/[projectId]",
      "page",
    );
    expect(cache.revalidatePath).toHaveBeenCalledWith("/reports");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/");
  });
});
