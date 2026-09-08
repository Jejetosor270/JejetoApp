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
import { NavigationTabs } from "./navigation-tabs";
import { PageHeader } from "./page-header";
import { DetailPageHeader } from "./detail-page-header";
import { Pagination } from "@/components/listing/pagination";
import { clearFiltersHref } from "@/components/listing/filter-navigation";
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
    expect(html).toContain(
      'href="/orders?view=financial&amp;sort=updated&amp;pageSize=50"',
    );
  });
  it("uses the same tab treatment for route links and mounted detail panels", () => {
    const html = renderToStaticMarkup(
      <NavigationTabs
        label="Payments sections"
        tabs={[
          {
            id: "supplier",
            label: "Supplier",
            href: "/payments?tab=supplier",
            active: true,
          },
          {
            id: "client",
            label: "Client",
            href: "/payments?tab=client",
            active: false,
          },
          {
            id: "entry",
            label: "Record Payment",
            href: "/payments?tab=entry",
            active: false,
          },
        ]}
      />,
    );
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html.match(/<a /g)).toHaveLength(3);
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("focus-visible:outline-2");
    expect(html).not.toContain('role="tab"');
  });
  it("retains the selected view and page size when clearing filters", () => {
    expect(
      clearFiltersHref(
        "/payments",
        new URLSearchParams(
          "tab=client&projectId=demo&status=PAID&page=4&pageSize=50",
        ),
      ),
    ).toBe("/payments?tab=client&pageSize=50");
  });
  it("shows human-readable grouped filter chips and a view-preserving clear action", () => {
    location.pathname = "/payments";
    location.search = "tab=client&counterpartyId=client-id&page=4";
    const html = renderToStaticMarkup(
      <FilterBar>
        <FilterField label="Client">
          <select name="counterpartyId" defaultValue="client-id">
            <optgroup label="Clients">
              <option value="client-id">Fictional Client</option>
            </optgroup>
          </select>
        </FilterField>
      </FilterBar>,
    );
    expect(html).toContain("Client: Fictional Client");
    expect(html).toContain('href="/payments?tab=client"');
    expect(html).toContain("Clear filters");
  });
  it("shows a single cash-direction chip and clears it without clearing the report", () => {
    location.pathname = "/reports";
    location.search = "view=payments&direction=CLIENT_RECEIPT&projectId=demo";
    const html = renderToStaticMarkup(
      <FilterBar>
        <FilterField label="Cash direction">
          <select name="direction" defaultValue="CLIENT_RECEIPT">
            <option value="CLIENT_RECEIPT">Client receipts</option>
          </select>
        </FilterField>
      </FilterBar>,
    );
    expect(html.match(/aria-label="Applied filters"/g)).toHaveLength(1);
    expect(html).toContain("Cash direction: Client receipts");
    expect(
      clearFiltersHref("/reports", new URLSearchParams(location.search)),
    ).toBe("/reports?view=payments");
  });
  it("keeps header titles and actions flexible at narrow widths", () => {
    for (const html of [
      renderToStaticMarkup(
        <PageHeader title="Purchasing" actions={<button>New Order</button>} />,
      ),
      renderToStaticMarkup(
        <DetailPageHeader
          title="Long Order reference"
          backHref="/orders"
          backLabel="Purchasing"
          eyebrow="Order"
          actions={<button>Edit</button>}
        />,
      ),
    ]) {
      expect(html.match(/<h1 /g)).toHaveLength(1);
      expect(html).toContain("break-words");
      expect(html).toContain("flex-wrap");
    }
    const pagination = renderToStaticMarkup(
      <Pagination
        page={2}
        pageSize={25}
        total={100}
        pathname="/payments"
        queryString="tab=client"
      />,
    );
    expect(pagination).toContain("flex flex-wrap items-center gap-2");
    expect(pagination).toContain("tab=client");
  });
});
