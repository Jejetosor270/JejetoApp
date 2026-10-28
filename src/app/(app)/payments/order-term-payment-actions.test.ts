import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  load: vi.fn(),
  undo: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({
  requireMasterDataEditor: mocks.authorize,
}));
vi.mock("@/lib/payments/order-term-payments", () => ({
  getOrderTermPayments: mocks.load,
  markSupplierTermUnpaid: mocks.undo,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/credits/source", () => ({
  CreditError: class CreditError extends Error {},
}));
vi.mock("@/lib/trash/service", () => ({
  TrashError: class TrashError extends Error {},
}));

import { CreditError } from "@/lib/credits/source";
import {
  loadOrderTermPaymentsAction,
  markSupplierTermUnpaidAction,
} from "./order-term-payment-actions";

const orderId = "cfbca6dd-b16b-46ea-bb96-22be3fb01a37";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ id: "actor" });
});

it.each(["load", "undo"] as const)(
  "authorizes before %s access",
  async (operation) => {
    mocks.authorize.mockRejectedValue(new Error("Forbidden"));
    const call =
      operation === "load"
        ? loadOrderTermPaymentsAction
        : markSupplierTermUnpaidAction;
    await expect(call({ orderId })).rejects.toThrow("Forbidden");
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.undo).not.toHaveBeenCalled();
  },
);

it("validates the Order identifier and returns only loaded drawer data", async () => {
  expect(await loadOrderTermPaymentsAction({ orderId: "invalid" })).toEqual({
    data: null,
    error: "Select a valid Order.",
  });
  expect(mocks.load).not.toHaveBeenCalled();
  const data = { orderId, orderNumber: "PO-1", cancelled: false, terms: [] };
  mocks.load.mockResolvedValue(data);
  expect(await loadOrderTermPaymentsAction({ orderId })).toEqual({
    data,
    error: null,
  });
  expect(mocks.load).toHaveBeenCalledWith(orderId);
});

it("handles missing and unavailable records without exposing internal errors", async () => {
  mocks.load.mockResolvedValue(null);
  expect((await loadOrderTermPaymentsAction({ orderId })).error).toBe(
    "This Order is no longer available.",
  );
  mocks.load.mockRejectedValue(new Error("Private connection detail"));
  expect(await loadOrderTermPaymentsAction({ orderId })).toEqual({
    data: null,
    error: "Payment terms could not be loaded. Please try again.",
  });
});

it("uses the authenticated actor and refreshes only after a successful correction", async () => {
  const input = { orderId, termId: "term", payments: [], reason: "Correction" };
  expect(await markSupplierTermUnpaidAction(input)).toEqual({ error: null });
  expect(mocks.undo).toHaveBeenCalledWith("actor", input);
  expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
});

it("keeps credit-history restrictions understandable and unexpected errors private", async () => {
  mocks.undo.mockRejectedValue(
    new CreditError(
      "This record is linked to credit history and cannot be moved to Trash.",
    ),
  );
  expect((await markSupplierTermUnpaidAction({ orderId })).error).toContain(
    "credit history",
  );
  mocks.undo.mockRejectedValue(new Error("Private connection detail"));
  const result = await markSupplierTermUnpaidAction({ orderId });
  expect(result.error).toContain("Payments could not be undone.");
  expect(result.error).not.toContain("Private");
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
