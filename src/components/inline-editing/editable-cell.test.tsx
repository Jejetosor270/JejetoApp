// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountForm } from "@/test/dom-form";
import { EditableCell } from "./editable-cell";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
let mounted: Awaited<ReturnType<typeof mountForm>>;
const save = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(async () => {
  await mounted?.unmount();
});
async function open() {
  mounted = await mountForm(
    <EditableCell
      label="Reference"
      value="Original"
      display="Original"
      canEdit
      onSave={save}
    />,
  );
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Edit Reference"]')
      ?.click(),
  );
}
async function enter(value: string) {
  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Reference"]',
  );
  if (!input) throw new Error("Missing editor");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}
it("focuses the editor, saves with Enter and clears the dirty form", async () => {
  save.mockResolvedValue({ status: "success" });
  await open();
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Reference");
  const input = await enter("Changed");
  expect(document.querySelector("form")?.dataset.dirty).toBe("true");
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(save).toHaveBeenCalledExactlyOnceWith("Changed", "Original");
  expect(refresh).toHaveBeenCalledOnce();
  expect(document.querySelector("form")).toBeNull();
});
it("Escape cancels without a save; blur retains the draft", async () => {
  await open();
  const input = await enter("Draft");
  await act(async () => input.blur());
  expect(input.value).toBe("Draft");
  expect(save).not.toHaveBeenCalled();
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.querySelector("form")).toBeNull();
  expect(save).not.toHaveBeenCalled();
});
it("retains the value on thrown errors and allows retry", async () => {
  save
    .mockRejectedValueOnce(new Error("Network"))
    .mockResolvedValueOnce({ status: "success" });
  await open();
  await enter("Draft");
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Save Reference"]')
      ?.click(),
  );
  expect(document.querySelector<HTMLInputElement>("input")?.value).toBe(
    "Draft",
  );
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "retained",
  );
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Save Reference"]')
      ?.click(),
  );
  expect(save).toHaveBeenCalledTimes(2);
});
it("blocks duplicate submits and cancellation while saving", async () => {
  let finish: ((value: { status: "success" }) => void) | undefined;
  save.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await open();
  const input = await enter("Draft");
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(save).toHaveBeenCalledOnce();
  expect(
    document.querySelector<HTMLButtonElement>(
      '[aria-label="Cancel editing Reference"]',
    )?.disabled,
  ).toBe(true);
  await act(async () => finish?.({ status: "success" }));
});

it("keeps one editor open and preserves its draft when another cell is clicked", async () => {
  mounted = await mountForm(
    <>
      <EditableCell
        label="Reference"
        value="Original"
        display="Original"
        canEdit
        onSave={save}
      />
      <EditableCell
        label="Other"
        value="Other"
        display="Other"
        canEdit
        onSave={save}
      />
    </>,
  );
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Edit Reference"]')
      ?.click(),
  );
  const input = await enter("Unsaved draft");
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Edit Other"]')
      ?.click(),
  );
  expect(document.querySelectorAll("form[data-cell-editor]")).toHaveLength(1);
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe("Unsaved draft");
  expect(save).not.toHaveBeenCalled();
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        '[aria-label="Cancel editing Reference"]',
      )
      ?.click(),
  );
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Edit Other"]')
      ?.click(),
  );
  expect(document.querySelector('input[aria-label="Other"]')).not.toBeNull();
});
