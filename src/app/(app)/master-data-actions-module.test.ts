import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

async function actionFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) =>
      entry.isDirectory()
        ? actionFiles(path.join(directory, entry.name))
        : entry.name === "actions.ts"
          ? [path.join(directory, entry.name)]
          : [],
    ),
  );
  return nested.flat();
}

describe("master-data server action modules", () => {
  it("export only async actions from every use-server action module", async () => {
    const files = await actionFiles(
      path.join(process.cwd(), "src", "app", "(app)"),
    );
    const contents = await Promise.all(
      files.map(async (file) => ({
        file,
        source: await readFile(file, "utf8"),
      })),
    );
    const actionModules = contents.filter(({ source }) =>
      source.startsWith('"use server"'),
    );
    expect(actionModules.length).toBeGreaterThan(0);
    for (const { file, source } of actionModules) {
      const exports = source.match(/^export\s+.*$/gm) ?? [];
      expect(exports, file).not.toHaveLength(0);
      expect(
        exports.every((line) =>
          /^export async function \w+Action\(/.test(line),
        ),
        `${file} has a non-action export`,
      ).toBe(true);
      if (!file.includes(`${path.sep}admin${path.sep}users${path.sep}`)) {
        expect(source, `${file} does not authorize its mutations`).toContain(
          "requireMasterDataEditor",
        );
      }
    }
  });
});
