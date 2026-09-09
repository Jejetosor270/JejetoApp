// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountForm, clickText } from "@/test/dom-form";
import { RelatedRecordTable } from "./related-records";
import { relatedHref, type RelatedTableData } from "@/lib/related-records/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
let view: Awaited<ReturnType<typeof mountForm>>;
beforeEach(() => push.mockClear());
afterEach(async () => { await view?.unmount(); });
const table: RelatedTableData = { id: "orders", title: "Orders", description: "Related Orders only.", columns: ["Order", "Amount"], numericColumns: [1], rows: Array.from({ length: 12 }, (_, index) => ({ id: String(index), href: relatedHref("order", String(index)), cells: [`Order ${index}`, "123.45 EUR"] })) };

it("lists records with consistent headings, currency alignment and actual destination links", async () => {
  view = await mountForm(<RelatedRecordTable table={table} />);
  expect(document.querySelector("h2")?.textContent).toBe("Orders (12)");
  expect(document.querySelector('a[href="/orders/0?tab=related"]')).not.toBeNull();
  expect(document.querySelectorAll("tbody tr")).toHaveLength(10);
  expect(document.querySelector("tbody tr td:last-child")?.className).toContain("text-right");
  await act(async () => { document.querySelector("tbody tr td:last-child")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(push).toHaveBeenCalledWith("/orders/0?tab=related");
});

it("pages through all related records without changing other section state", async () => {
  view = await mountForm(<><RelatedRecordTable table={table} /><RelatedRecordTable table={{ ...table, id: "other", title: "Other" }} /></>);
  await clickText("Next");
  expect(document.querySelector('section[aria-label="Orders"] tbody')?.textContent).toContain("Order 10");
  expect(document.querySelector('section[aria-label="Other"] tbody')?.textContent).toContain("Order 0");
  expect(push).not.toHaveBeenCalled();
});

it("keeps actions independent of row navigation", async () => {
  view = await mountForm(<RelatedRecordTable table={table} rowActions={{ "0": <button type="button">Edit allocation</button> }} />);
  await clickText("Edit allocation");
  expect(push).not.toHaveBeenCalled();
});

it("shows an explicit empty table, not a missing section", async () => {
  view = await mountForm(<RelatedRecordTable table={{ ...table, rows: [] }} />);
  expect(document.querySelector("h2")?.textContent).toBe("Orders (0)");
  expect(document.querySelector("tbody")?.textContent).toBe("No related orders.");
});

it.each([ ["project", "/projects/"], ["order", "/orders/"], ["billing", "/billing/"], ["payment", "/payments/"], ["receipt", "/receipts/"], ["supplier-installment", "/installments/supplier/"], ["client-installment", "/installments/client/"] ] as const)("links %s to its Related page", (kind, prefix) => {
  expect(relatedHref(kind, "record")).toBe(prefix + "record?tab=related");
});
