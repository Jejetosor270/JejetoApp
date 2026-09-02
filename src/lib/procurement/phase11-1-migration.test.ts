import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const migration = readFileSync(
  path.join(
    root,
    "prisma/migrations/20260903000000_phase11_1_markup_first/migration.sql",
  ),
  "utf8",
);

describe("Phase 11.1 markup migration", () => {
  it("adds component defaults and nullable Order overrides", () => {
    expect(migration).toContain("ADD VALUE 'COMPONENT_MARKUP'");
    expect(migration).toContain('"defaultProductMarkupRate"');
    expect(migration).toContain('"defaultFreightMarkupRate"');
    expect(migration).toContain('"productMarkupOverrideRate"');
    expect(migration).toContain('"freightMarkupOverrideRate"');
  });

  it("preserves legacy Order pricing instead of fabricating overrides", () => {
    expect(migration).not.toMatch(/UPDATE\s+"procurement_orders"/i);
    expect(migration).not.toMatch(/DROP (?:TABLE|COLUMN|TYPE)/);
  });
});
