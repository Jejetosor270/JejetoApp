import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("employee server action module", () => {
  it("exports only async server actions", async () => {
    const serverDirective = ["use", "server"].join(" ");
    const actionModule = await readFile(
      path.join(
        process.cwd(),
        "src",
        "app",
        "(app)",
        "admin",
        "users",
        "actions.ts",
      ),
      "utf8",
    );
    const exports = actionModule.match(/^export\s+.*$/gm) ?? [];

    expect(actionModule).toContain(`"${serverDirective}"`);
    expect(exports).toHaveLength(3);
    expect(exports).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^export async function createEmployeeAction/),
        expect.stringMatching(/^export async function updateEmployeeAction/),
        expect.stringMatching(
          /^export async function resetEmployeePasswordAction/,
        ),
      ]),
    );
  });
});
