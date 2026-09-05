// @vitest-environment happy-dom
import { createElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickText, control, enter, mountForm } from "@/test/dom-form";
import { projectEditorFixture } from "@/test/project-editor-fixture";

const services = vi.hoisted(() => ({
  updateProject: vi.fn(),
  requireMasterDataEditor: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({
  requireMasterDataEditor: services.requireMasterDataEditor,
}));
vi.mock("@/lib/master-data/projects", () => ({
  updateProject: services.updateProject,
}));
vi.mock("@/app/(app)/items/actions", () => ({
  createRoomAction: vi.fn(),
  updateRoomInlineAction: vi.fn(),
}));

import { EditProject } from "./project-detail";
import { EditorDrawer } from "@/components/forms/editor-drawer";

function Editor() {
  const [open, setOpen] = useState(true);
  return (
    <EditorDrawer title="Edit project" open={open} onOpenChange={setOpen}>
      <EditProject {...projectEditorFixture()} onClose={() => setOpen(false)} />
    </EditorDrawer>
  );
}

describe("Project edit drawer", () => {
  let view: Awaited<ReturnType<typeof mountForm>>;
  beforeEach(async () => {
    vi.clearAllMocks();
    services.requireMasterDataEditor.mockResolvedValue({
      id: "fictional-actor",
    });
    services.updateProject.mockResolvedValue(undefined);
    view = await mountForm(createElement(Editor));
  });
  afterEach(async () => {
    await view.unmount();
  });

  it("has one header, text name/code controls, all field groups and unchanged submitted values", () => {
    expect(
      [...document.querySelectorAll("h2")].filter(
        (node) => node.textContent === "Edit project",
      ),
    ).toHaveLength(1);
    expect(
      [...document.querySelectorAll("button")].filter(
        (node) => node.textContent === "Close",
      ),
    ).toHaveLength(1);
    expect(control("name").getAttribute("inputmode")).toBeNull();
    expect(control("code").getAttribute("inputmode")).toBeNull();
    expect(
      [...document.querySelectorAll("legend")].map((node) => node.textContent),
    ).toEqual([
      "General",
      "Schedule",
      "Planning / Budget",
      "Default Pricing",
      "Freight",
      "Notes",
    ]);
    const form = control("name").form;
    expect(Object.fromEntries(new FormData(form ?? undefined))).toMatchObject({
      name: "Fictional Villa",
      code: "VILLA-A",
      reportingCurrencyCode: "EUR",
      defaultProductMarkupRate: "15",
      startDate: "2026-09-01",
      freightEstimateRate: "10",
      estimatedPurchaseCostHt: "50000.0000",
    });
    expect(document.querySelector('[class*="xl:col-span-3"]')).toBeNull();
  });

  it("keeps every field after real server validation fails and closes after a corrected save", async () => {
    await enter("name", "Edited Villa");
    await enter("notes", "Employee draft remains");
    await enter("clientBudgetTargetHt", "bad amount");
    const form = control("name").form;
    const before = [...new FormData(form ?? undefined)];
    await clickText("Save changes");
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(control("clientBudgetTargetHt").getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect([...new FormData(form ?? undefined)]).toEqual(before);
    expect(services.updateProject).not.toHaveBeenCalled();
    await enter("clientBudgetTargetHt", "123456.78");
    await clickText("Save changes");
    expect(services.updateProject).toHaveBeenCalledWith(
      "fictional-actor",
      expect.objectContaining({
        name: "Edited Villa",
        notes: "Employee draft remains",
        clientBudgetTargetHt: "123456.7800",
        reportingCurrencyCode: "EUR",
      }),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("requires deliberate discard and retains edits when Keep editing is chosen", async () => {
    await enter("name", "Unsaved Villa");
    await clickText("Close");
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    await clickText("Keep editing");
    expect(control("name").value).toBe("Unsaved Villa");
    await clickText("Close");
    await clickText("Discard changes");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(services.updateProject).not.toHaveBeenCalled();
  });
});
