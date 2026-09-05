import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

export async function mountForm(content: ReactNode) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(content));
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

export function control(
  name: string,
): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const element = document.querySelector<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >(`[name="${name}"]`);
  if (!element) throw new Error(`Missing form control ${name}`);
  if (element instanceof HTMLInputElement && element.type === "hidden") {
    const visible = element.previousElementSibling;
    if (visible instanceof HTMLInputElement && visible.type !== "hidden")
      return visible;
  }
  return element;
}

export async function enter(name: string, value: string) {
  const element = control(name);
  await act(async () => {
    const prototype =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
      element,
      value,
    );
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}

export async function clickText(text: string) {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find((node) => node.textContent?.trim() === text);
  if (!button) throw new Error(`Missing button ${text}`);
  await act(async () => button.click());
}
