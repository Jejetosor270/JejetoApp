import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("supplier quote server action boundary", () => {
  it("keeps provider access and mutations behind authenticated async actions", async () => {
    const source = await readFile(
      path.join(
        process.cwd(),
        "src",
        "app",
        "(app)",
        "orders",
        "import",
        "actions.ts",
      ),
      "utf8",
    );
    expect(source.startsWith('"use server"')).toBe(true);
    expect(source.match(/requireMasterDataEditor\(\)/g)).toHaveLength(2);
    const exports = source.match(/^export\s+.*$/gm) ?? [];
    expect(exports).toEqual([
      expect.stringMatching(
        /^export async function processSupplierQuoteAction/,
      ),
      expect.stringMatching(
        /^export async function confirmSupplierQuoteAction/,
      ),
    ]);
    expect(source).not.toContain("OPENAI_API_KEY");
  });
});
