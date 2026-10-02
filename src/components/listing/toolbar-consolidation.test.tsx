// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { mountForm, clickText, enter } from "@/test/dom-form";
import { FilterBar } from "./filter-bar";
import { FilterField } from "./filter-field";
import { ViewField, ViewSelector } from "./view-selector";

vi.mock("next/navigation", () => ({
  usePathname: () => "/orders",
  useSearchParams: () => new URLSearchParams("q=outdoor&view=financial&page=9"),
}));

const options = [
  { label: "Standard", value: "standard" },
  { label: "Financial", value: "financial" },
];
let view: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => {
  await view?.unmount();
});

it.each([
  ["Purchasing", "view", "Columns"],
  ["Reports", "portfolioView", "View"],
])(
  "submits %s presentation controls and filters once through one GET form, resetting pagination",
  async (_workspace, field, label) => {
    view = await mountForm(
      <FilterBar
        controls={
          <ViewField
            field={field}
            label={label}
            options={options}
            defaultValue="standard"
          />
        }
      >
        <FilterField label="Search">
          <input name="q" defaultValue="outdoor" />
        </FilterField>
        <FilterField label="Project">
          <select name="projectId" defaultValue="project">
            <option value="project">Project</option>
          </select>
        </FilterField>
        <FilterField label="Sort by">
          <select name="sort" defaultValue="reference">
            <option value="reference">Reference</option>
          </select>
        </FilterField>
        <FilterField label="Rows per page">
          <select name="pageSize" defaultValue="25">
            <option value="25">25</option>
          </select>
        </FilterField>
        <button type="submit">Apply</button>
      </FilterBar>,
    );
    const forms = document.querySelectorAll("form");
    expect(forms).toHaveLength(1);
    const form = forms[0];
    if (!form) throw new Error("Missing toolbar form");
    expect(form.method).toBe("get");
    expect(form.querySelectorAll('button[type="submit"]')).toHaveLength(1);
    expect(form.querySelector(`select[name="${field}"]`)?.closest("form")).toBe(
      form,
    );
    expect(form.querySelector('input[name="q"]')?.closest("form")).toBe(form);
    const submit = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", submit);
    await enter(field, "financial");
    await enter("q", "revised search");
    expect(submit).not.toHaveBeenCalled();
    await clickText("Apply");
    expect(submit).toHaveBeenCalledOnce();
    const data = new FormData(form);
    expect(data.getAll(field)).toEqual(["financial"]);
    expect(data.get("q")).toBe("revised search");
    expect(data.get("projectId")).toBe("project");
    // Advanced/collapsed controls remain submitted, but the old URL page does not.
    expect(data.get("sort")).toBe("reference");
    expect(data.get("pageSize")).toBe("25");
    expect(data.has("page")).toBe(false);
  },
);

it("preserves validated scope and sorting in a standalone ViewSelector without duplicate view or stale page", async () => {
  view = await mountForm(
    <ViewSelector
      pathname="/orders"
      queryString="q=chairs&projectId=project&supplierId=supplier&status=ORDERED&sort=invoiceDate&direction=desc&pageSize=50&page=8&view=standard&view=financial"
      field="view"
      options={options}
      defaultValue="standard"
    />,
  );
  const form = document.querySelector("form");
  if (!form) throw new Error("Missing selector form");
  expect(form.getAttribute("action")).toBe("/orders");
  expect(form.method).toBe("get");
  await enter("view", "financial");
  expect(Object.fromEntries(new FormData(form))).toEqual({
    q: "chairs",
    projectId: "project",
    supplierId: "supplier",
    status: "ORDERED",
    sort: "invoiceDate",
    direction: "desc",
    pageSize: "50",
    view: "financial",
  });
  expect(new FormData(form).getAll("view")).toEqual(["financial"]);
});

it("falls back to the configured standalone presentation when the requested view is unavailable", async () => {
  view = await mountForm(
    <ViewSelector
      pathname="/reports"
      queryString="projectId=project&portfolioView=removed&page=3"
      field="portfolioView"
      options={options}
      defaultValue="standard"
    />,
  );
  const form = document.querySelector("form");
  if (!form) throw new Error("Missing selector form");
  const data = new FormData(form);
  expect(data.getAll("portfolioView")).toEqual(["standard"]);
  expect(data.get("projectId")).toBe("project");
  expect(data.has("page")).toBe(false);
});
