// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountForm, enter, control, clickText } from "@/test/dom-form";
const actions = vi.hoisted(() => ({
  load: vi.fn(),
  move: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/app/(app)/payments/move-actions", () => ({
  loadCashMoveOptions: actions.load,
  moveCashAction: actions.move,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: actions.refresh }),
}));
vi.mock("@/components/forms/editor-drawer", () => ({
  EditorDrawer: ({ children }: { children: ReactNode }) => (
    <section role="dialog">{children}</section>
  ),
}));
import { CashMoveEditor } from "./cash-move-editor";

let view: Awaited<ReturnType<typeof mountForm>>;
const options = {
  sourceVersion: "a".repeat(64),
  sourceLabel: "Old Invoice",
  amount: "40.1234",
  currencyCode: "EUR",
  projectId: "project-a",
  projects: [
    { id: "project-a", name: "First Project" },
    { id: "project-b", name: "Second Project" },
  ],
  targets: [
    {
      id: "invoice",
      label: "Invoice · Furniture",
      remaining: "120",
      version: "b".repeat(64),
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  actions.load.mockResolvedValue({ options, message: "" });
  actions.move.mockResolvedValue({
    success: false,
    message: "Changed since opening. Your draft is retained.",
  });
});
afterEach(async () => view?.unmount());

async function submit() {
  await enter("targetId", "invoice");
  await enter("reason", "Wrong Invoice selected");
  await act(async () => control("confirmed").click());
  await act(async () =>
    document
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}

it("keeps the correction draft after a rejected move and never submits new money", async () => {
  view = await mountForm(<CashMoveEditor kind="CLIENT_RECEIPT" id="receipt" />);
  await clickText("Move receipt");
  await submit();
  expect(actions.move).toHaveBeenCalledWith({
    kind: "CLIENT_RECEIPT",
    id: "receipt",
    targetId: "invoice",
    sourceVersion: options.sourceVersion,
    targetVersion: "b".repeat(64),
    reason: "Wrong Invoice selected",
    confirmed: "yes",
  });
  expect(control("targetId").value).toBe("invoice");
  expect(control("reason").value).toBe("Wrong Invoice selected");
  expect((control("confirmed") as HTMLInputElement).checked).toBe(true);
  expect(document.body.textContent).toContain("Your draft is retained");
  expect(actions.refresh).not.toHaveBeenCalled();
});

it("does not refresh the opening source version when switching Projects", async () => {
  view = await mountForm(<CashMoveEditor kind="CLIENT_RECEIPT" id="receipt" />);
  await clickText("Move receipt");
  actions.load.mockResolvedValue({
    options: {
      ...options,
      sourceVersion: "c".repeat(64),
      projectId: "project-b",
    },
    message: "",
  });
  await enter("projectId", "project-b");
  await submit();
  expect(actions.move.mock.calls[0]?.[0].sourceVersion).toBe(
    options.sourceVersion,
  );
  expect(actions.load).toHaveBeenLastCalledWith({
    kind: "CLIENT_RECEIPT",
    id: "receipt",
    projectId: "project-b",
  });
});

it("closes and refreshes after a successful move", async () => {
  actions.move.mockResolvedValue({ success: true, message: "Moved" });
  const moved = vi.fn();
  view = await mountForm(
    <CashMoveEditor kind="SUPPLIER_PAYMENT" id="payment" onMoved={moved} />,
  );
  await clickText("Move payment");
  await submit();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(actions.refresh).toHaveBeenCalledOnce();
  expect(moved).toHaveBeenCalledOnce();
});
