import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { projectRead } from "./project-diagnostics";
it("keeps diagnostics safe and preserves the original failure", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const error = Object.assign(new Error("private commercial data"), {
    code: "P2022",
  });
  try {
    await expect(
      projectRead("financials", async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(log).toHaveBeenCalledWith("Project detail read failed", {
      stage: "financials",
      errorType: "Error",
      code: "P2022",
      digest: undefined,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "private commercial data",
    );
    expect(await projectRead("financials", async () => 1)).toBe(1);
  } finally {
    log.mockRestore();
  }
});
