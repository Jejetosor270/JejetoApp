import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { modelMap } from "./model-map";
it("keeps the visibility relation map synchronized with the Prisma schema", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const blocks = [...schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)];
  const names = new Set(blocks.map((row) => row[1]));
  for (const [, name, body] of blocks) {
    if (!name || !body) continue;
    const relations: Record<string, unknown> = {};
    for (const line of body.split("\n")) {
      const match = line.trim().match(/^(\w+)\s+(\w+)(\[\]|\?)?(?:\s|$)/);
      if (!match?.[1] || !match[2] || !names.has(match[2])) continue;
      const fields = line.match(/fields:\s*\[([^\]]+)\]/)?.[1];
      relations[match[1]] = {
        model: match[2],
        many: match[3] === "[]",
        optional: match[3] === "?",
        fields: fields ? fields.split(",").map((value) => value.trim()) : [],
      };
    }
    expect(modelMap[name], name).toEqual({
      table: body.match(/@@map\("([^"]+)"\)/)?.[1] ?? name,
      trash: /trashedAt\s+DateTime\?/.test(body),
      relations,
    });
  }
});
