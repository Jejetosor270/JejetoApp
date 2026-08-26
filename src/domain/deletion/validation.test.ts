import { describe, expect, it } from "vitest";

import { selectedIds, selectedIdsSchema } from "@/domain/deletion/validation";

const firstId = "a12b6b9b-10e9-4e42-b93f-38796de4f65a";
const secondId = "b12b6b9b-10e9-4e42-b93f-38796de4f65a";

describe("bulk selection validation", () => {
  it("accepts a unique bounded UUID selection", () => {
    const formData = new FormData();
    formData.append("selectedIds", firstId);
    formData.append("selectedIds", secondId);
    expect(selectedIdsSchema.parse(selectedIds(formData))).toEqual([
      firstId,
      secondId,
    ]);
  });

  it("rejects empty, duplicate, and malformed selections", () => {
    expect(selectedIdsSchema.safeParse([]).success).toBe(false);
    expect(selectedIdsSchema.safeParse([firstId, firstId]).success).toBe(false);
    expect(selectedIdsSchema.safeParse(["not-an-id"]).success).toBe(false);
  });
});
