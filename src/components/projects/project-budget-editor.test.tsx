// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { clickText, control, enter, mountForm } from "@/test/dom-form";
import { projectEditorFixture } from "@/test/project-editor-fixture";
const services = vi.hoisted(() => ({ update: vi.fn(), actor: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({
  requireMasterDataEditor: services.actor,
}));
vi.mock("@/lib/master-data/projects", () => ({
  updateProjectBudget: services.update,
}));
import { ProjectBudgetProvider } from "./project-budget-editor";
import { EditProjectBudgetButton } from "./project-budget-context";
import { updateProjectBudgetAction } from "@/app/(app)/projects/[projectId]/actions";
let view: Awaited<ReturnType<typeof mountForm>>;
afterEach(async () => {
  await view?.unmount();
  vi.resetAllMocks();
});
async function mount(canEdit = true) {
  services.actor.mockResolvedValue({ id: "actor" });
  services.update.mockResolvedValue(undefined);
  view = await mountForm(
    <ProjectBudgetProvider
      project={projectEditorFixture().project}
      canEdit={canEdit}
    >
      <EditProjectBudgetButton />
    </ProjectBudgetProvider>,
  );
}
it("opens a focused editor, preserves drafts and hidden direct targets across mode switches, and saves only budget fields", async () => {
  await mount();
  await clickText("Edit budget & pricing");
  expect(document.querySelector('[name="name"]')).toBeNull();
  expect(control("expectedSellHt").closest("[hidden]")).not.toBeNull();
  await enter("targetMode", "EXPECTED_SELL");
  expect(control("expectedSellHt").closest("[hidden]")).toBeNull();
  await enter("expectedSellHt", "90000");
  await enter("targetMode", "MARKUP");
  await enter("targetMode", "EXPECTED_SELL");
  expect(control("expectedSellHt").value).toContain("90");
  await enter("estimatedPurchaseCostHt", "bad amount");
  await clickText("Save budget & pricing");
  expect(services.update).not.toHaveBeenCalled();
  expect(control("estimatedPurchaseCostHt").getAttribute("aria-invalid")).toBe(
    "true",
  );
  await clickText("Close");
  await clickText("Keep editing");
  expect(control("estimatedPurchaseCostHt").value).toBe("bad amount");
  await enter("estimatedPurchaseCostHt", "1234.56");
  await clickText("Save budget & pricing");
  expect(services.update).toHaveBeenCalledWith(
    "actor",
    expect.objectContaining({
      estimatedPurchaseCostHt: "1234.5600",
      expectedSellHt: "90000.0000",
      targetMode: "EXPECTED_SELL",
    }),
  );
  expect(services.update.mock.calls[0]?.[1]).not.toHaveProperty("name");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it("hides editing for read-only users and enforces authorization on direct action calls", async () => {
  await mount(false);
  expect(document.querySelector("button")).toBeNull();
  services.actor.mockRejectedValue(new Error("Forbidden"));
  await expect(
    updateProjectBudgetAction({ status: "idle", message: "" }, new FormData()),
  ).rejects.toThrow("Forbidden");
  expect(services.update).not.toHaveBeenCalled();
});
