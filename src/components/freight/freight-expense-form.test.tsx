// @vitest-environment happy-dom
import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { control, enter, clickText, mountForm } from "@/test/dom-form";
import {
  FreightExpenseForm,
  type FreightExpenseView,
} from "./freight-expense-form";

const actions = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock("@/app/(app)/projects/[projectId]/actions", () => ({
  createProjectFreightExpenseAction: actions.create,
  updateProjectFreightExpenseAction: actions.update,
}));
const options = {
  currencies: [
    { code: "EUR", name: "Euro" },
    { code: "USD", name: "Dollar" },
  ],
  suppliers: [{ id: "supplier", displayName: "Freight Supplier" }],
  projectId: "project",
  reportingCurrencyCode: "EUR",
};
const expense: FreightExpenseView = {
  id: "expense",
  costAmountHt: "100",
  currencyCode: "USD",
  description: "Transport",
  dueDate: "2026-10-20",
  expenseDate: "2026-10-01",
  editVersion: "a".repeat(64),
  hasPayments: false,
  freightMarkupOverrideRate: "0.15",
  fxRate: "0.923456789",
  notes: "Original notes",
  reference: "F-1",
  supplierId: "supplier",
  supplier: { displayName: "Freight Supplier" },
  vatTreatment: "DOMESTIC",
  vatRate: "0.20",
  vatAmount: "20",
  vatAmountIsManual: false,
  recoverability: "RECOVERABLE",
  recoverableRate: "1",
};
let view: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => {
  await view?.unmount();
});
beforeEach(() => {
  vi.clearAllMocks();
  actions.update.mockResolvedValue({
    status: "error",
    message: "Changed since editing began. Draft retained.",
  });
  actions.create.mockResolvedValue({
    status: "error",
    message: "Review the expense.",
  });
});
async function submit() {
  await act(async () => {
    control("description").form?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}
function RefreshableForm() {
  const [initial, setInitial] = useState(expense);
  return (
    <>
      <button
        onClick={() =>
          setInitial({
            ...expense,
            editVersion: "b".repeat(64),
            description: "Server edit",
          })
        }
      >
        Refresh record
      </button>
      <FreightExpenseForm {...options} initial={initial} />
    </>
  );
}
describe("full freight expense editor", () => {
  it("uses the same full fields for creation with optional due date and VAT", async () => {
    view = await mountForm(<FreightExpenseForm {...options} />);
    for (const name of [
      "description",
      "reference",
      "supplierId",
      "expenseDate",
      "dueDate",
      "currencyCode",
      "costAmountHt",
      "fxRate",
      "freightMarkupOverrideRate",
      "vatTreatment",
      "vatRate",
      "vatAmount",
      "vatRecoverableRate",
      "notes",
    ]) {
      expect(control(name)).toBeTruthy();
    }
    await enter("description", "Shipping");
    await enter("costAmountHt", "450");
    await submit();
    expect(actions.create).toHaveBeenCalledOnce();
    expect(actions.create.mock.calls[0]?.[1].get("description")).toBe(
      "Shipping",
    );
    expect(control("description").value).toBe("Shipping");
  });

  it("preserves all failed edits and the opening version across refreshes", async () => {
    view = await mountForm(<RefreshableForm />);
    await enter("description", "Corrected transport");
    await enter("costAmountHt", "123.45");
    await enter("reference", "F-2");
    await enter("notes", "Please retain");
    await clickText("Refresh record");
    await submit();
    const data = actions.update.mock.calls[0]?.[1] as FormData;
    expect(data.get("expectedVersion")).toBe(expense.editVersion);
    expect(data.get("description")).toBe("Corrected transport");
    expect(data.get("costAmountHt")).toBe("123.45");
    expect(data.get("fxRate")).toBe("0.923456789");
    expect(data.get("vatAmount")).toBe("");
    expect(data.get("vatRecoverableRate")).toBe("100");
    expect(data.get("dueDate")).toBe("2026-10-20");
    expect(control("notes").value).toBe("Please retain");
    expect(control("reference").value).toBe("F-2");
    expect(document.body.textContent).toContain("Draft retained");
  });

  it("retains explicit manual VAT and paid Supplier/currency context", async () => {
    view = await mountForm(
      <FreightExpenseForm
        {...options}
        initial={{ ...expense, vatAmountIsManual: true, hasPayments: true }}
      />,
    );
    expect(
      [...document.querySelectorAll("select")].filter(
        (select) => select.disabled,
      ),
    ).toHaveLength(2);
    await submit();
    const data = actions.update.mock.calls[0]?.[1] as FormData;
    expect(data.get("supplierId")).toBe("supplier");
    expect(data.get("currencyCode")).toBe("USD");
    expect(data.get("vatAmount")).toBe("20");
  });
});
