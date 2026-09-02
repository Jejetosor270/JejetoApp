import { describe, expect, it } from "vitest";

import { optionalUuid, requiredUuid } from "@/domain/validation/uuid";

describe("relationship UUID validation", () => {
  it("normalizes blank optional relationship values to null", () => {
    expect(optionalUuid("Select a link.").parse("")).toBeNull();
  });

  it("keeps strict UUID validation with friendly messages", () => {
    const result = requiredUuid("Select a Project.").safeParse("none");
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]?.message).toBe("Select a Project.");
  });
});
