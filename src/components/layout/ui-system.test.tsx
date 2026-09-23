// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import { mountForm, clickText, enter, control } from "@/test/dom-form";
import { RecordFields } from "./record-presentation";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { controlVariants } from "@/components/forms/control-styles";
import { filterControlClassName } from "@/components/listing/filter-field";
import { inputClassName } from "@/components/master-data/form-ui";
import { EditorDrawer, EditorActions } from "@/components/forms/editor-drawer";

let view: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => {
  await view?.unmount();
});

it("uses the loaded Geist variables and coherent semantic aliases", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  expect(css).toContain("--font-sans: var(--font-geist-sans)");
  expect(css).toContain("--font-mono: var(--font-geist-mono)");
  expect(css).toContain("--color-success-foreground: var(--positive)");
  expect(css).toContain("--color-success-muted: var(--positive-muted)");
  expect(css).toContain("--color-warning-foreground: var(--warning)");
  expect(css).toMatch(/\.page-title\s*\{[^}]*break-words/);
});

it("shares standard controls and provides a compact variant with accessible states", () => {
  expect(inputClassName).toBe(filterControlClassName);
  expect(inputClassName).toBe(controlVariants());
  expect(controlVariants({ density: "compact" })).toContain("h-8");
  expect(controlVariants()).toContain("h-9");
  for (const density of ["compact", "standard"] as const) {
    expect(controlVariants({ density })).toContain(
      "aria-invalid:border-destructive",
    );
    expect(controlVariants({ density })).toContain("focus-visible:ring-2");
  }
  expect(buttonVariants({ size: "icon-xs" })).toContain("size-7");
});

it.each(["neutral", "info", "success", "warning", "destructive"] as const)(
  "keeps textual %s badges",
  (variant) => {
    const markup = renderToStaticMarkup(
      <Badge variant={variant}>Status label</Badge>,
    );
    expect(markup).toContain("Status label");
    expect(badgeVariants({ variant })).toContain("text-");
  },
);

it("wraps normal record values but preserves explicit money and date treatment", async () => {
  view = await mountForm(
    <RecordFields
      values={[
        { label: "Supplier", value: "A long supplier legal name" },
        { label: "Amount", value: "100 000.00 EUR", kind: "financial" },
        { label: "Invoice date", value: "23/09/2026", kind: "date" },
      ]}
    />,
  );
  const fields = document.querySelectorAll("dd");
  expect(fields[0]?.className).toContain("whitespace-normal");
  expect(fields[0]?.className).not.toContain("financial-figure");
  expect(fields[1]?.className).toContain("whitespace-nowrap");
  expect(fields[2]?.textContent).toBe("23/09/2026");
  expect(document.querySelector("dl")?.className).toContain("@container");
});

it.each([
  ["compact", "sm:max-w-md"],
  ["standard", "sm:max-w-2xl"],
  ["wide", "sm:max-w-[calc(100vw-3rem)]"],
] as const)(
  "renders the %s drawer without changing form ownership",
  async (size, width) => {
    view = await mountForm(
      <EditorDrawer title="Edit test" size={size}>
        <form>
          <input name="draft" defaultValue="Original" />
          <EditorActions>
            <button type="submit">Save</button>
          </EditorActions>
        </form>
      </EditorDrawer>,
    );
    await clickText("Edit test");
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.className).toContain(width);
    expect(
      dialog?.querySelector('button[type="submit"]')?.closest("form"),
    ).toBeTruthy();
    await enter("draft", "Keep this draft");
    await clickText("Close");
    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain("Discard unsaved changes?");
    await clickText("Keep editing");
    expect(control("draft").value).toBe("Keep this draft");
  },
);
