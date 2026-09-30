// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { clickText, mountForm } from "@/test/dom-form";
import {
  ProjectFinancialDrilldowns,
  ProjectFinancialLink,
} from "./project-financial-drilldown";
let view: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => {
  await view?.unmount();
});
it("opens only the selected supporting records and preserves the surrounding draft when closed", async () => {
  view = await mountForm(
    <ProjectFinancialDrilldowns
      currency="EUR"
      today="2026-09-30"
      end="2026-10-29"
      rows={[
        {
          kind: "issued",
          label: "Invoice A",
          href: "/billing/a",
          amount: "100",
          due: "2026-10-10",
        },
        {
          kind: "issued",
          label: "Invoice B",
          href: "/billing/b",
          amount: null,
          due: "2026-10-20",
        },
        {
          kind: "planned",
          label: "Quote C",
          href: "/billing/c",
          amount: "200",
          due: "2026-10-10",
        },
        {
          kind: "issued",
          label: "Overdue D",
          href: "/billing/d",
          amount: "50",
          due: "2026-09-29",
        },
      ]}
    >
      <input defaultValue="Unrelated draft" />
      <ProjectFinancialLink href="#financial:upcomingIn">
        Review upcoming receipts
      </ProjectFinancialLink>
    </ProjectFinancialDrilldowns>,
  );
  await clickText("Review upcoming receipts");
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.textContent).toContain("Invoice A");
  expect(dialog?.textContent).toContain("Invoice B");
  expect(dialog?.textContent).toContain("Incomplete");
  expect(dialog?.textContent).not.toContain("Quote C");
  expect(dialog?.textContent).not.toContain("Overdue D");
  expect(dialog?.querySelector('a[href="/billing/a"]')).not.toBeNull();
  await clickText("Close");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector("input")?.value).toBe("Unrelated draft");
});
