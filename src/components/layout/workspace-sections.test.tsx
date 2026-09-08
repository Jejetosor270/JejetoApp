// @vitest-environment happy-dom
import { act, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountForm, enter, clickText, control } from "@/test/dom-form";
import { WorkspaceSections } from "./workspace-sections";
import { ViewSelector } from "@/components/listing/view-selector";

const location = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(location.query),
}));

function Example() {
  const [count, setCount] = useState(0);
  return (
    <>
      <button onClick={() => setCount(count + 1)}>Refresh summary</button>
      <WorkspaceSections
        label="Order details"
        sections={[
          {
            id: "overview",
            label: "Overview",
            content: <p>Summary {count}</p>,
          },
          {
            id: "payments",
            label: "Supplier payments",
            content: <input name="notes" defaultValue="Original" />,
          },
          { id: "delivery", label: "Delivery", content: "Tracking" },
        ]}
      />
    </>
  );
}

describe("simplified detail and list navigation", () => {
  let view: Awaited<ReturnType<typeof mountForm>>;
  beforeEach(() => {
    location.query = "";
    window.history.replaceState(null, "", "/orders/demo");
  });
  afterEach(async () => {
    await view?.unmount();
  });

  it("shows one summary without tabs and retains drafts through collapse and rerender", async () => {
    view = await mountForm(<Example />);
    expect(view.container.querySelector('[role="tablist"]')).toBeNull();
    const section =
      view.container.querySelector<HTMLDetailsElement>("#payments");
    expect(section?.open).toBe(false);
    if (!section) throw new Error("Missing section");
    section.open = true;
    await enter("notes", "Keep this draft");
    section.open = false;
    await clickText("Refresh summary");
    section.open = true;
    expect(control("notes").value).toBe("Keep this draft");
    expect(view.container.textContent).toContain("Summary 1");
  });

  it("opens old tab links and hash links without unmounting other sections", async () => {
    location.query = "tab=payments";
    view = await mountForm(<Example />);
    expect(
      view.container.querySelector<HTMLDetailsElement>("#payments")?.open,
    ).toBe(true);
    await view.unmount();
    location.query = "";
    view = await mountForm(<Example />);
    await act(async () => {
      window.history.replaceState(null, "", "#delivery");
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(
      view.container.querySelector<HTMLDetailsElement>("#delivery")?.open,
    ).toBe(true);
    expect(control("notes").value).toBe("Original");
  });

  it("preserves scoped filters and page size while changing columns, resetting the page", () => {
    const html = renderToStaticMarkup(
      <ViewSelector
        pathname="/orders"
        queryString="projectId=demo&status=DRAFT&page=3&pageSize=50&view=financial"
        field="view"
        defaultValue="general"
        options={[
          { label: "Standard", value: "general" },
          { label: "Cost detail", value: "financial" },
        ]}
      />,
    );
    expect(html).toContain('name="projectId" value="demo"');
    expect(html).toContain('name="status" value="DRAFT"');
    expect(html).toContain('name="pageSize" value="50"');
    expect(html).not.toContain('name="page"');
    expect(html.match(/name="view"/g)).toHaveLength(1);
    expect(html).toContain('value="financial" selected=""');
  });
});
