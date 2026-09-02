import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("shared persistent Server Action form pattern", () => {
  it("captures FormData without allowing React to reset failed drafts", () => {
    const source = readFileSync(
      "src/components/forms/use-persistent-action-state.ts",
      "utf8",
    );
    expect(source).toContain("event.preventDefault()");
    expect(source).toContain("new FormData(event.currentTarget)");
    expect(source).toContain("dispatch(formData)");
  });
});
