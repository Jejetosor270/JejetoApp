import { describe, expect, it } from "vitest";

import {
  parsePageInput,
  parseSort,
  parseSortDirection,
} from "@/domain/listing/validation";

describe("operational list URL state", () => {
  it("parses valid pagination and rejects unsupported page sizes", () => {
    expect(parsePageInput({ page: "3", pageSize: "50" })).toEqual({
      page: 3,
      pageSize: 50,
    });
    expect(parsePageInput({ page: "-2", pageSize: "999" })).toEqual({
      page: 1,
      pageSize: 25,
    });
  });

  it("uses only allowlisted sorting values", () => {
    expect(parseSort(["name", "updated"] as const, "name", "updated")).toBe(
      "name",
    );
    expect(parseSort(["name", "updated"] as const, "unsafe", "updated")).toBe(
      "updated",
    );
    expect(parseSortDirection("asc")).toBe("asc");
    expect(parseSortDirection("anything")).toBe("desc");
  });
});
