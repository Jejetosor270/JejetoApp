import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  editVersion,
  editFieldVersions,
  assertEditVersion,
} from "./edit-version";

it("is stable across database field and relation ordering", () => {
  const a = { total: "100", rows: [{ id: "b" }, { id: "a" }] };
  const b = { rows: [{ id: "a" }, { id: "b" }], total: "100" };
  expect(editVersion(a)).toBe(editVersion(b));
  expect(() => assertEditVersion(editVersion(a), b)).not.toThrow();
});
it("rejects dependent financial changes and names changed fields without exposing values", () => {
  const original = { reference: "private-ref", costLines: [{ amount: "100" }] };
  const updated = { ...original, costLines: [{ amount: "110" }] };
  expect(() =>
    assertEditVersion(
      editVersion(original),
      updated,
      editFieldVersions(original),
    ),
  ).toThrow("cost Lines");
  expect(() =>
    assertEditVersion(editVersion(original), updated, "invalid"),
  ).toThrow("draft is retained");
  expect(editFieldVersions(original)).not.toContain("private-ref");
});
