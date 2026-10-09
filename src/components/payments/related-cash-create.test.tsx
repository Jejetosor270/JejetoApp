// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clickText, control, enter, mountForm } from "@/test/dom-form";
import { RelatedCashCreate } from "./related-cash-create";
import { BillingTermForm } from "@/components/billing/billing-term-form";
import type { ClientBillingView } from "@/lib/billing/billing";
import { clientBillingInstallmentCreateSchema } from "@/domain/billing/validation";

const mock = vi.hoisted(() => ({
  load: vi.fn(),
  receipt: vi.fn(),
  installment: vi.fn(),
  update: vi.fn(),
  supplier: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/app/(app)/related-records/create-actions", () => ({
  loadRelatedCreation: mock.load,
}));
vi.mock("@/app/(app)/billing/actions", () => ({
  recordClientReceiptAction: mock.receipt,
  createClientBillingInstallmentAction: mock.installment,
  updateClientBillingInstallmentAction: mock.update,
}));
vi.mock("@/app/(app)/payments/actions", () => ({
  createInstallmentAction: mock.supplier,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mock.refresh }),
}));
const scope = { kind: "billing" as const, id: "invoice-id" };
const documentData = {
  id: scope.id,
  totalTtc: "1200",
  currencyCode: "EUR",
  project: { reportingCurrencyCode: "EUR" },
  paymentInstallments: [],
};
let view: Awaited<ReturnType<typeof mountForm>>;
beforeEach(() => {
  vi.resetAllMocks();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  mock.load.mockResolvedValue({
    data: {
      choices: [{ id: scope.id, label: "INV1" }],
      currencies: [{ code: "EUR" }],
      form: { type: "client", document: documentData },
    },
    message: "",
  });
});
afterEach(async () => {
  await view?.unmount();
});
async function submit() {
  await act(async () => {
    document
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
it("loads only when opened and retains the invoice and draft after a receipt error", async () => {
  mock.receipt.mockResolvedValue({
    status: "error",
    message: "Amount exceeds the outstanding balance.",
  });
  view = await mountForm(<RelatedCashCreate scope={scope} kind="receipt" />);
  expect(mock.load).not.toHaveBeenCalled();
  await clickText("Add receipt");
  expect(mock.load).toHaveBeenCalledWith(scope, "receipt", undefined);
  expect(
    document.querySelector<HTMLSelectElement>('[aria-label="Related document"]')
      ?.value,
  ).toBe(scope.id);
  await enter("amount", "1250");
  await enter("reference", "Bank reference");
  await submit();
  const values = mock.receipt.mock.calls[0]?.[1] as FormData;
  expect(values.get("billingDocumentId")).toBe(scope.id);
  expect(values.get("amount")).toBe("1250");
  expect(control("reference").value).toBe("Bank reference");
  expect(document.body.textContent).toContain("Amount exceeds");
  expect(mock.refresh).not.toHaveBeenCalled();
  mock.receipt.mockResolvedValue({ status: "success", message: "Saved" });
  await enter("amount", "100");
  await submit();
  expect(mock.refresh).toHaveBeenCalled();
  expect(document.querySelector("form")).toBeNull();
});
it("creates billing installments through billing validation, preserving exact amount", async () => {
  mock.installment.mockResolvedValue({
    status: "error",
    message: "Review the date",
  });
  view = await mountForm(
    <RelatedCashCreate scope={scope} kind="client-installment" />,
  );
  await clickText("Add Client payment term");
  await enter("label", "Deposit");
  await enter("amountDisplay", "300.25");
  await enter("dueDate", "2026-10-01");
  await submit();
  const values = mock.installment.mock.calls[0]?.[1] as FormData;
  expect(values.get("billingDocumentId")).toBe(scope.id);
  expect(values.get("scheduledAmount")).toBe("300.25");
  expect(values.get("basis")).toBe("FIXED_AMOUNT");
  expect(values.has("expectedFxRate")).toBe(false);
  expect(mock.supplier).not.toHaveBeenCalled();
  expect(control("label").value).toBe("Deposit");
});
it("offers a retry after a load failure", async () => {
  mock.load.mockRejectedValueOnce(new Error("Offline"));
  view = await mountForm(<RelatedCashCreate scope={scope} kind="receipt" />);
  await clickText("Add receipt");
  expect(document.querySelector("form")).toBeNull();
  await clickText("Retry");
  expect(document.querySelector("form")).not.toBeNull();
});

it("submits Billing percentages in human units, converting exactly once in validation", async () => {
  mock.installment.mockResolvedValue({
    status: "error",
    message: "Keep draft",
  });
  view = await mountForm(
    <RelatedCashCreate scope={scope} kind="client-installment" />,
  );
  await clickText("Add Client payment term");
  await enter("label", "Deposit");
  const percentLabel = [...document.querySelectorAll("label")].find((label) =>
    label.textContent?.includes("Payment term %"),
  );
  const input = percentLabel?.querySelector("input");
  if (!input) throw new Error("Missing term percentage");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, "30");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await submit();
  const values = mock.installment.mock.calls[0]?.[1] as FormData;
  expect(values.get("percentageRate")).toBe("30");
  expect(values.get("scheduledAmount")).toBe("360.0000");
  const parsed = clientBillingInstallmentCreateSchema.parse({
    ...Object.fromEntries(values),
    billingDocumentId: "a12b6b9b-10e9-4e42-b93f-38796de4f65a",
  });
  expect(parsed.percentageRate).toBe("0.300000");
});

it("prefills fixed Billing terms and preserves their amount and draft when editing fails", async () => {
  mock.update.mockResolvedValue({
    status: "error",
    message: "Review the term",
  });
  const term = {
    id: "term-id",
    billingDocumentId: scope.id,
    billingTotalTtc: "1200",
    basis: "FIXED_AMOUNT",
    currencyCode: "EUR",
    label: "Deposit",
    percentageRate: null,
    scheduledAmount: "300",
    dueDate: "2026-12-01",
    notes: "Keep note",
  } as ClientBillingView["paymentInstallments"][number];
  view = await mountForm(
    <BillingTermForm document={documentData} installment={term} />,
  );
  const percentLabel = [...document.querySelectorAll("label")].find((label) =>
    label.textContent?.includes("Payment term %"),
  );
  expect(percentLabel?.querySelector("input")?.value).toBe("25");
  await enter("label", "Reviewed deposit");
  await submit();
  const values = mock.update.mock.calls[0]?.[1] as FormData;
  expect(values.get("id")).toBe(term.id);
  expect(values.get("basis")).toBe("FIXED_AMOUNT");
  expect(values.get("scheduledAmount")).toBe("300");
  expect(values.get("dueDate")).toBe("2026-12-01");
  expect(control("label").value).toBe("Reviewed deposit");
  expect(control("notes").value).toBe("Keep note");
  expect(document.body.textContent).toContain("Review the term");
  expect(mock.installment).not.toHaveBeenCalled();
});
