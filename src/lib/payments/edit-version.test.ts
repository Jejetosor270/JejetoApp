import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  cashEditVersion,
  paymentTermEditVersion,
  paymentVersionMatches,
} from "./edit-version";

it("ignores relation projections and child ordering while detecting cash changes", () => {
  const first = {
    id: "cash-a",
    amount: "10",
    receivedAt: new Date("2026-10-01"),
  };
  const second = {
    id: "cash-b",
    amount: "20",
    receivedAt: new Date("2026-10-02"),
  };
  const source = {
    id: "term",
    scheduledAmount: "100",
    receipts: [first, second],
  };
  const version = paymentTermEditVersion(source, "120.0000");
  expect(
    paymentTermEditVersion({ ...source, receipts: [second, first] }, "120"),
  ).toBe(version);
  expect(
    paymentTermEditVersion(
      { ...source, receipts: [first, { ...second, amount: "21" }] },
      "120",
    ),
  ).not.toBe(version);
  expect(paymentTermEditVersion(source, "121")).not.toBe(version);
  expect(
    cashEditVersion({ ...first, extraRelation: { name: "Not financial" } }),
  ).toBe(cashEditVersion(first));
  expect(paymentVersionMatches(undefined, version)).toBe(false);
});
