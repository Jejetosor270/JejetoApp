// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountForm, clickText } from "@/test/dom-form";
import { RelatedRecordTable } from "./related-records";
import {
  relatedHref,
  type RelatedTableData,
} from "@/lib/related-records/types";

const actions = vi.hoisted(() => ({
  edit: vi.fn(),
  unassign: vi.fn(),
  financial: vi.fn(),
  remove: vi.fn(),
  trash: vi.fn(),
}));
vi.mock("@/app/(app)/related-records/actions", () => ({
  editRelatedNameAction: actions.edit,
  removeOptionalLinksAction: actions.remove,
}));
vi.mock("@/app/(app)/unassigned-cash/actions", () => ({
  unassignCashAction: actions.unassign,
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
let view: Awaited<ReturnType<typeof mountForm>>;
beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  await view?.unmount();
});
const table: RelatedTableData = {
  id: "orders",
  title: "Orders",
  description: "Related Orders only.",
  columns: ["Order", "Amount"],
  numericColumns: [1],
  rows: Array.from({ length: 12 }, (_, index) => ({
    id: String(index),
    href: relatedHref("order", String(index)),
    cells: [`Order ${index}`, "123.45 EUR"],
  })),
};

it("lists records with consistent headings, currency alignment and actual destination links", async () => {
  view = await mountForm(<RelatedRecordTable table={table} />);
  expect(document.querySelector("h2")?.textContent).toBe("Orders (12)");
  expect(
    document.querySelector('a[href="/orders/0?tab=related"]'),
  ).not.toBeNull();
  expect(document.querySelectorAll("tbody tr")).toHaveLength(10);
  expect(document.querySelector("tbody tr td:last-child")?.className).toContain(
    "text-right",
  );
  await act(async () => {
    document
      .querySelector("tbody tr td:last-child")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(push).toHaveBeenCalledWith("/orders/0?tab=related");
});

it("pages through all related records without changing other section state", async () => {
  view = await mountForm(
    <>
      <RelatedRecordTable table={table} />
      <RelatedRecordTable table={{ ...table, id: "other", title: "Other" }} />
    </>,
  );
  await clickText("Next");
  expect(
    document.querySelector('section[aria-label="Orders"] tbody')?.textContent,
  ).toContain("Order 10");
  expect(
    document.querySelector('section[aria-label="Other"] tbody')?.textContent,
  ).toContain("Order 0");
  expect(push).not.toHaveBeenCalled();
});

it("keeps actions independent of row navigation", async () => {
  view = await mountForm(
    <RelatedRecordTable
      table={table}
      rowActions={{ "0": <button type="button">Edit allocation</button> }}
    />,
  );
  await clickText("Edit allocation");
  expect(push).not.toHaveBeenCalled();
});

it("shows an explicit empty table, not a missing section", async () => {
  view = await mountForm(<RelatedRecordTable table={{ ...table, rows: [] }} />);
  expect(document.querySelector("h2")?.textContent).toBe("Orders (0)");
  expect(document.querySelector("tbody")?.textContent).toBe(
    "No related orders.",
  );
});

it.each([
  ["project", "/projects/"],
  ["order", "/orders/"],
  ["billing", "/billing/"],
  ["payment", "/payments/"],
  ["receipt", "/receipts/"],
  ["supplier-installment", "/installments/supplier/"],
  ["client-installment", "/installments/client/"],
] as const)("links %s to its Related page", (kind, prefix) => {
  expect(relatedHref(kind, "record")).toBe(prefix + "record?tab=related");
});

it("edits a related row in place and retains rejected drafts", async () => {
  actions.edit.mockResolvedValue({
    status: "error",
    message: "Reference is already used.",
  });
  view = await mountForm(
    <RelatedRecordTable
      table={{ ...table, editKind: "order", rows: table.rows.slice(0, 1) }}
    />,
  );
  await clickText("Edit");
  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Order"]',
  );
  if (!input) throw new Error("Missing inline field");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, "Changed");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await clickText("Save");
  expect(input.value).toBe("Changed");
  expect(document.body.textContent).toContain("Reference is already used.");
  expect(push).not.toHaveBeenCalled();
});
it.each(["payment", "receipt"] as const)(
  "removes only checked visible %s links after confirmation",
  async (kind) => {
    actions.unassign.mockResolvedValue({
      status: "success",
      message: "Unassigned",
    });
    view = await mountForm(
      <RelatedRecordTable table={{ ...table, removal: { kind } }} />,
    );
    await act(async () =>
      document
        .querySelector<HTMLInputElement>('input[aria-label="Select Order 0"]')
        ?.click(),
    );
    await clickText("Remove selected links");
    expect(document.body.textContent).toContain("Unassigned cash records");
    await clickText("Cancel");
    expect(actions.unassign).not.toHaveBeenCalled();
    await clickText("Remove selected links");
    await clickText("Remove links");
    expect(actions.unassign.mock.calls[0]?.[0]).toBe(kind);
    expect(
      (actions.unassign.mock.calls[0]?.[1] as FormData).getAll("selectedIds"),
    ).toEqual(["0"]);
  },
);

vi.mock("@/app/(app)/related-records/inline-actions", () => ({
  editRelatedFinancialRowAction: actions.financial,
}));
vi.mock("@/app/(app)/settings/trash/actions", () => ({
  trashSelectedAction: actions.trash,
}));

it("keeps money and date drafts together after a rejected financial edit", async () => {
  actions.financial.mockResolvedValue({
    status: "error",
    message: "Review the amount.",
  });
  view = await mountForm(
    <RelatedRecordTable
      table={{
        ...table,
        editKind: "payment",
        editParentId: "parent",
        columns: ["Payment", "Amount", "Date"],
        rows: [
          {
            id: "cash",
            cells: ["Payment", "10.00 EUR", "24/09/2026"],
            editFields: [
              {
                column: 1,
                name: "amount",
                type: "money",
                value: "10",
                currency: "EUR",
              },
              { column: 2, name: "date", type: "date", value: "2026-09-24" },
            ],
          },
        ],
      }}
    />,
  );
  await clickText("Edit");
  for (const [label, value] of [
    ["Amount", "15.1256"],
    ["Date", "25/09/2026"],
  ]) {
    const input = document.querySelector<HTMLInputElement>(
      `input[aria-label="${label}"]`,
    );
    if (!input) throw new Error(`Missing ${label} field`);
    await act(async () => {
      input.focus();
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  await clickText("Save");
  expect(document.body.textContent).toContain("Review the amount.");
  expect(actions.financial).toHaveBeenCalledTimes(1);
  const saved = actions.financial.mock.calls[0];
  if (!saved) throw new Error("Missing financial edit submission");
  const [kind, parent, data] = saved;
  expect([kind, parent]).toEqual(["payment", "parent"]);
  expect(data.get("amount")).toBe("15.1256");
  expect(data.get("date")).toBe("2026-09-25");
  await clickText("Save");
  expect(actions.financial.mock.calls[1]?.[2].get("amount")).toBe("15.1256");
  expect(actions.financial.mock.calls[1]?.[2].get("date")).toBe("2026-09-25");
  expect(push).not.toHaveBeenCalled();
});
