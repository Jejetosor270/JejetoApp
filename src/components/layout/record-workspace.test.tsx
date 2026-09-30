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

const projectWorkspace = (
  <RecordWorkspace
    label="Project"
    relatedNavigation
    sections={[
      {
        id: "overview",
        label: "Summary",
        group: "details",
        content: <input name="detailDraft" defaultValue="Original detail" />,
      },
      {
        id: "work",
        label: "Billing",
        group: "related",
        content: <input name="billingDraft" defaultValue="Original billing" />,
      },
      {
        id: "freight",
        label: "Freight",
        group: "related",
        content: <input name="freightDraft" defaultValue="Original freight" />,
      },
    ]}
  />
);

function selectedRelatedSection() {
  return document.querySelector(
    'nav[aria-label="Project related sections"] [aria-pressed="true"]',
  )?.textContent;
}

it.each([
  ["?tab=related#freight", "Freight"],
  ["?tab=freight", "Freight"],
  ["#freight", "Freight"],
  ["?tab=related&section=freight", "Freight"],
  ["?tab=related&section=work#freight", "Billing"],
  ["?tab=freight&section=work", "Billing"],
  ["?tab=related&section=missing#freight", "Freight"],
  ["?tab=freight&section=missing#work", "Freight"],
  ["?tab=related&section=missing#missing", "Billing"],
])(
  "opens the intended Project related work area for %s",
  async (url, section) => {
    window.history.replaceState(null, "", "/projects/demo" + url);
    view = await mountForm(projectWorkspace);
    expect(
      document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
    ).toBe("Related");
    expect(selectedRelatedSection()).toBe(section);
  },
);

it("keeps the explicit Details tab even with a remembered Related section", async () => {
  window.history.replaceState(
    null,
    "",
    "/projects/demo?tab=details&section=freight",
  );
  view = await mountForm(projectWorkspace);
  expect(
    document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
  ).toBe("Details");
  await clickText("Related");
  expect(selectedRelatedSection()).toBe("Freight");
});

it("preserves drafts through section selection, hash changes and history navigation", async () => {
  window.history.replaceState(null, "", "/projects/demo?tab=related#freight");
  view = await mountForm(projectWorkspace);
  const freightInput = control("freightDraft");
  await enter("freightDraft", "Keep freight");
  await clickText("Billing");
  await enter("billingDraft", "Keep billing");
  expect(window.location.search).toBe("?tab=related&section=work");
  expect(window.location.hash).toBe("");

  // Reproduce the browser's restored URL and popstate notification on Back.
  await act(async () => {
    window.history.replaceState(null, "", "/projects/demo?tab=related#freight");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(selectedRelatedSection()).toBe("Freight");
  expect(control("freightDraft")).toBe(freightInput);
  expect(freightInput.value).toBe("Keep freight");

  // Forward restores the explicit section selection without remounting editors.
  await act(async () => {
    window.history.replaceState(
      null,
      "",
      "/projects/demo?tab=related&section=work",
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(selectedRelatedSection()).toBe("Billing");
  expect(control("billingDraft").value).toBe("Keep billing");

  await act(async () => {
    window.history.replaceState(null, "", "/projects/demo?tab=related");
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.location.hash = "freight";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(selectedRelatedSection()).toBe("Freight");
  await clickText("Details");
  await enter("detailDraft", "Keep detail");
  await clickText("Related");
  expect(control("freightDraft").value).toBe("Keep freight");
  expect(control("billingDraft").value).toBe("Keep billing");
  expect(control("detailDraft").value).toBe("Keep detail");
});
