// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { clickText, mountForm } from "@/test/dom-form";
const calls = vi.hoisted(() => ({
  save: vi.fn(),
  trash: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: calls.refresh }),
}));
vi.mock("@/app/(app)/unassigned-cash/actions", () => ({
  editUnassignedCashAction: calls.save,
  trashUnassignedCashAction: calls.trash,
}));
import { UnassignedCashTable } from "./unassigned-cash-table";
let view: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => {
  await view?.unmount();
  vi.clearAllMocks();
});
const row = {
  id: "cash",
  reference: "Receipt",
  direction: "CLIENT_RECEIPT",
  date: "2026-09-01",
  amount: "40.1256",
  currency: "USD",
  reportingCurrency: "EUR",
  fxRate: "0.95",
};
it("preserves failed cash edits and keeps currency and FX read-only", async () => {
  calls.save.mockResolvedValue({
    status: "error",
    message: "Please review the amount.",
  });
  view = await mountForm(<UnassignedCashTable rows={[row]} canEdit />);
  await clickText("Edit");
  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Reference"]',
  );
  if (!input) throw new Error("Missing Reference");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, "Changed");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await clickText("Save");
  expect(input.value).toBe("Changed");
  expect(document.body.textContent).toContain("Please review the amount.");
  const form = calls.save.mock.calls[0]?.[0] as FormData;
  expect(form.get("amount")).toBe("40.1256");
  expect(form.has("currencyCode")).toBe(false);
  expect(form.has("fxRate")).toBe(false);
});
it("does not expose mutations to readers", async () => {
  view = await mountForm(<UnassignedCashTable rows={[row]} canEdit={false} />);
  expect(
    document.querySelectorAll('input[type="checkbox"],button'),
  ).toHaveLength(0);
  expect(document.body.textContent).toContain("Client receipt");
});
