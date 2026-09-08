// @vitest-environment happy-dom
import Link from "next/link";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clickText, mountForm } from "@/test/dom-form";
import { projectEditorFixture } from "@/test/project-editor-fixture";
import { ProjectDetail } from "./project-detail";

vi.mock("./actions", () => ({
  createBuildingAction: vi.fn(),
  updateBuildingAction: vi.fn(),
  updateProjectAction: vi.fn(),
}));
vi.mock("@/app/(app)/items/actions", () => ({
  createRoomAction: vi.fn(),
  updateRoomInlineAction: vi.fn(),
}));
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useSearchParams: () =>
      new URLSearchParams(
        useSyncExternalStore(
          (callback) => {
            window.addEventListener("popstate", callback);
            return () => window.removeEventListener("popstate", callback);
          },
          () => window.location.search,
          () => "",
        ),
      ),
  };
});

let view: Awaited<ReturnType<typeof mountForm>>;
beforeEach(() => {
  window.history.replaceState(null, "", "/projects/demo");
  const push = window.history.pushState.bind(window.history);
  vi.spyOn(window.history, "pushState").mockImplementation((...args) => {
    push(...args);
    window.dispatchEvent(new Event("popstate"));
  });
});
afterEach(async () => {
  await view?.unmount();
  vi.restoreAllMocks();
});

async function mount(canEdit = true, items = false) {
  view = await mountForm(
    <ProjectDetail
      {...projectEditorFixture()}
      canEdit={canEdit}
      buildings={[]}
      workspace={{
        overview: <p>Financial summary</p>,
        finance: <p>Targets and VAT</p>,
        budget: <p>Purchase budget</p>,
        packages: (
          <input aria-label="Package draft" defaultValue="Original package" />
        ),
        freightExpenses: <p>Freight expenses</p>,
        items: items ? (
          <Link href="/items?projectId=demo">Open Items</Link>
        ) : null,
      }}
    />,
  );
}
function visible() {
  return document.querySelector('[role="tabpanel"]:not([hidden])');
}

it("uses Details/Related and keeps Project fields separate from scoped work and related records", async () => {
  await mount();
  expect(
    [...document.querySelectorAll('[role="tab"]')].map(
      (tab) => tab.textContent,
    ),
  ).toEqual(["Details", "Related"]);
  expect(visible()?.textContent).toContain("General & dates");
  expect(visible()?.textContent).toContain("Planning & pricing");
  expect(visible()?.textContent).toContain("01/09/2026");
  expect(visible()?.textContent).toContain("50 000.00 EUR");
  expect(visible()?.textContent).toContain("15%");
  expect(visible()?.textContent).toContain("Targets and VAT");
  expect(visible()?.textContent).toContain("Purchase budget");
  expect(visible()?.querySelector('[aria-label="Project work"]')).toBeNull();
  expect(
    document.body.textContent?.match(/Fictional project notes/g),
  ).toHaveLength(1);
  await clickText("Related");
  const projectId = projectEditorFixture().project.id;
  for (const path of ["orders", "billing", "payments", "reports"]) {
    expect(
      visible()?.querySelector(`a[href="/${path}?projectId=${projectId}"]`),
    ).not.toBeNull();
  }
  expect(visible()?.textContent).toContain("Buildings & Rooms");
  expect(visible()?.textContent).toContain("Freight expenses");
  expect(visible()?.textContent).not.toContain("Targets and VAT");
  expect(visible()?.textContent).not.toContain("Items (Beta)");
  const draft = document.querySelector<HTMLInputElement>(
    '[aria-label="Package draft"]',
  );
  if (!draft) throw new Error("Missing package editor");
  draft.value = "Keep package draft";
  await clickText("Details");
  await clickText("Related");
  expect(
    document.querySelector<HTMLInputElement>('[aria-label="Package draft"]')
      ?.value,
  ).toBe("Keep package draft");
});

it.each([
  ["?tab=finance", "Details"],
  ["?tab=buildings", "Related"],
  ["#orders", "Related"],
  ["?tab=freight", "Related"],
])("supports Project subsection link %s", async (url, selected) => {
  window.history.replaceState(null, "", "/projects/demo" + url);
  await mount(false, true);
  expect(
    document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
  ).toBe(selected);
  expect(document.body.textContent).not.toContain("Edit project");
  expect(document.body.textContent).not.toContain("Add building");
  expect(
    document.querySelector('a[href="/items?projectId=demo"]'),
  ).not.toBeNull();
});
