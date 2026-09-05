import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const location = vi.hoisted(() => ({ pathname: "/projects/demo", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
  useRouter: () => ({ push: vi.fn() }),
}));

import { WorkspaceTabs } from "./workspace-tabs";
import { NavigationLinks } from "@/components/app-shell/sidebar-navigation";
import { navigationForRole } from "@/config/navigation";
import { Field, MoneyInput } from "@/components/master-data/form-ui";
import { FilterBar } from "@/components/listing/filter-bar";
import { FilterField } from "@/components/listing/filter-field";
import { ViewShortcuts } from "@/components/listing/view-shortcuts";
import { SortHeader } from "@/components/listing/sort-header";
import { ListEmptyState } from "@/components/listing/empty-state";

describe("workspace accessibility and navigation contracts", () => {
  beforeEach(() => {
    location.pathname = "/projects/demo";
    location.search = "";
  });
  it("marks exactly one sidebar destination active on a detail route", () => {
    const groups = navigationForRole("ADMIN", true);
    const html = groups
      .map((group) =>
        renderToStaticMarkup(createElement(NavigationLinks, { group })),
      )
      .join("");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html.match(/<a[^>]*aria-current="page"[^>]*>/)?.[0]).toContain(
      'href="/projects"',
    );
  });
  it("retains every panel's draft inputs while deep-linking to the selected tab", () => {
    location.search = "tab=cash&horizon=90d";
    const html = renderToStaticMarkup(
      createElement(WorkspaceTabs, {
        label: "Project",
        tabs: [
          {
            id: "overview",
            label: "Overview",
            content: createElement("input", {
              defaultValue: "Retained draft",
              name: "notes",
            }),
          },
          {
            id: "cash",
            label: "Cash",
            content: createElement("p", null, "Actual cash"),
          },
        ],
      }),
    );
    expect(html).toContain('value="Retained draft"');
    expect(html).toMatch(/role="tabpanel"[^>]*hidden=""/);
    expect(html).toMatch(/role="tab" aria-selected="true"[^>]*>Cash/);
    expect(html.match(/tabindex="0"/g)).toHaveLength(3);
  });
  it("falls back to an available tab when a Beta-only tab is unavailable", () => {
    location.search = "tab=items";
    const html = renderToStaticMarkup(
      createElement(WorkspaceTabs, {
        label: "Project",
        tabs: [
          { id: "overview", label: "Overview", content: "Project overview" },
        ],
      }),
    );
    expect(html).toContain('aria-selected="true"');
    expect(html).not.toContain('hidden=""');
  });
  it("connects errors to native and Decimal-aware controls", () => {
    for (const child of [
      createElement("input", { name: "reference" }),
      createElement(MoneyInput, { name: "amount", defaultValue: "42.50" }),
    ]) {
      const html = renderToStaticMarkup(
        <Field label="Required value" error="Enter a value">
          {child}
        </Field>,
      );
      const errorId = html.match(/<span id="([^"]+)"[^>]*role="alert"/)?.[1];
      expect(errorId).toBeTruthy();
      expect(html).toContain(`aria-describedby="${errorId}"`);
      expect(html).toContain('aria-invalid="true"');
    }
  });
  it("keeps primary and advanced fields in the same GET form", () => {
    const fields = ["Search", "Client", "Project", "Currency"].map(
      (label, index) => (
        <FilterField key={label} label={label}>
          <input name={`field${index}`} defaultValue={label} />
        </FilterField>
      ),
    );
    const html = renderToStaticMarkup(createElement(FilterBar, null, fields));
    expect(html.match(/<form /g)).toHaveLength(1);
    expect(html).toContain('method="get"');
    expect(html).toMatch(/<details[\s\S]*name="field3"/);
  });
  it("preserves scoped filters while changing a list shortcut and resets pagination", () => {
    const html = renderToStaticMarkup(
      createElement(ViewShortcuts, {
        pathname: "/payments",
        queryString: "projectId=demo&page=3&pageSize=50",
        field: "status",
        options: [{ label: "Overdue", value: "OVERDUE" }],
      }),
    );
    expect(html).toContain("projectId=demo&amp;pageSize=50&amp;status=OVERDUE");
    expect(html).not.toContain("page=3");
  });
  it("announces the current sort and retains filters while reversing it", () => {
    location.pathname = "/payments";
    location.search =
      "projectId=demo&sort=amount&sortDirection=asc&page=3&pageSize=50";
    const html = renderToStaticMarkup(
      <table>
        <thead>
          <tr>
            <SortHeader
              label="Amount"
              field="amount"
              defaultSort="dueDate"
              directionKey="sortDirection"
            />
          </tr>
        </thead>
      </table>,
    );
    expect(html).toContain('aria-sort="ascending"');
    expect(html).toContain("sortDirection=desc");
    expect(html).toContain("projectId=demo");
    expect(html).toContain("pageSize=50");
    expect(html).not.toContain("page=3");
  });
  it("distinguishes an empty list from a filtered result", () => {
    location.pathname = "/orders";
    location.search = "view=financial&sort=updated&pageSize=50";
    expect(renderToStaticMarkup(<ListEmptyState entity="Orders" />)).toContain(
      "No Orders yet.",
    );
    location.search += "&projectId=demo";
    const html = renderToStaticMarkup(<ListEmptyState entity="Orders" />);
    expect(html).toContain("No Orders match these filters.");
    expect(html).toContain('href="/orders"');
  });
});
