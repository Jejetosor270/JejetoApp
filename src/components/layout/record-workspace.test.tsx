// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountForm, enter, clickText, control } from "@/test/dom-form";
import { RecordWorkspace } from "./record-workspace";

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
  window.history.replaceState(null, "", "/orders/demo");
  const push = window.history.pushState.bind(window.history);
  // Next normally integrates native pushState with useSearchParams.
  vi.spyOn(window.history, "pushState").mockImplementation((...args) => {
    push(...args);
    window.dispatchEvent(new Event("popstate"));
  });
});
afterEach(async () => {
  await view?.unmount();
  vi.restoreAllMocks();
});

const workspace = (
  <RecordWorkspace
    label="Record"
    sections={[
      {
        id: "overview",
        label: "Summary",
        group: "details",
        content: <input name="detailDraft" defaultValue="Original detail" />,
      },
      {
        id: "commercial",
        label: "Commercial",
        group: "details",
        content: "Cost and VAT",
      },
      {
        id: "payments",
        label: "Payments",
        group: "related",
        content: <input name="paymentDraft" defaultValue="Original payment" />,
      },
      {
        id: "allocations",
        label: "Allocations",
        group: "related",
        content: "Order allocations",
      },
    ]}
  />
);

it("has exactly two keyboard-accessible tabs and preserves drafts in both", async () => {
  view = await mountForm(workspace);
  expect(
    [...document.querySelectorAll('[role="tab"]')].map(
      (tab) => tab.textContent,
    ),
  ).toEqual(["Details", "Related"]);
  await enter("detailDraft", "Keep detail");
  await clickText("Related");
  expect(
    document.querySelector('[role="tabpanel"]:not([hidden])')?.textContent,
  ).toContain("Order allocations");
  await enter("paymentDraft", "Keep payment");
  await clickText("Details");
  expect(control("detailDraft").value).toBe("Keep detail");
  await act(async () => {
    document
      .querySelector('[role="tab"][aria-selected="true"]')
      ?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
  });
  expect(control("paymentDraft").value).toBe("Keep payment");
  expect(document.activeElement?.textContent).toBe("Related");
});

it.each([
  ["?tab=payments", "Related"],
  ["?tab=allocations", "Related"],
  ["?tab=commercial", "Details"],
  ["#allocations", "Related"],
  ["?tab=unknown", "Details"],
])("preserves legacy link %s", async (url, tab) => {
  window.history.replaceState(null, "", "/orders/demo" + url);
  view = await mountForm(workspace);
  expect(
    document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
  ).toBe(tab);
  expect(document.querySelectorAll('[role="tab"]')).toHaveLength(2);
  expect(control("detailDraft")).toBeTruthy();
  expect(control("paymentDraft")).toBeTruthy();
});
