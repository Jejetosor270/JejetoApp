// @vitest-environment happy-dom
import { act, type AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantPanel } from "./assistant-panel";
import { DraftGuard } from "@/components/forms/draft-guard";
import type { AssistantActionResult } from "@/domain/assistant/contracts";
import { clickText, control, enter, mountForm } from "@/test/dom-form";

const askAssistant = vi.hoisted(() => vi.fn());
vi.mock("@/app/(app)/assistant-actions", () => ({ askAssistant }));
vi.mock("next/link", () => ({
  default: ({
    onNavigate,
    prefetch,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    prefetch?: boolean;
    onNavigate?: () => void;
  }) => (
    <a
      {...props}
      data-prefetch={String(prefetch)}
      onClick={(event) => {
        event.preventDefault();
        onNavigate?.();
      }}
    />
  ),
}));

const success: AssistantActionResult = {
  ok: true,
  reply: {
    message: "Which record did you mean?",
    query: "DEMO",
    truncated: true,
    moreHref: "/search?q=DEMO",
    results: [
      {
        id: "one",
        type: "Order",
        label: "DEMO-001",
        context: "Sample Project · Demo Supplier",
        href: "/orders/one",
      },
      {
        id: "two",
        type: "Billing",
        label: "DEMO-002",
        context: "Sample Project",
        href: "/billing/two",
      },
    ],
  },
};
let view: Awaited<ReturnType<typeof mountForm>>;
beforeEach(() => {
  vi.clearAllMocks();
  askAssistant.mockResolvedValue(success);
});
afterEach(async () => {
  await view?.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function open() {
  view = await mountForm(<AssistantPanel />);
  await clickText("Assistant");
}

async function submit(message = "Find Order DEMO-001") {
  await enter("assistantMessage", message);
  await clickText("Send");
}

describe("Phase 1 assistant panel", () => {
  it("opens a shared accessible drawer and returns bounded record links", async () => {
    await open();
    expect(document.activeElement).toBe(control("assistantMessage"));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Read-only record finder",
    );
    expect(document.querySelector("form")?.dataset.draftGuard).toBe("off");
    expect(control("assistantMessage").getAttribute("maxlength")).toBe("800");
    await submit();
    expect(askAssistant).toHaveBeenCalledExactlyOnceWith({
      message: "Find Order DEMO-001",
      recentMessages: [],
    });
    expect(document.querySelector('[role="log"]')?.textContent).toContain(
      "Which record did you mean?",
    );
    expect(
      document.querySelector('a[href="/orders/one"]')?.textContent,
    ).toContain("DEMO-001");
    expect(
      document.querySelector('a[href="/search?q=DEMO"]')?.textContent,
    ).toContain("Open search");
    expect(control("assistantMessage").value).toBe("");
  });

  it("retains conversation and draft on close, and clears them only with New chat", async () => {
    const local = vi.spyOn(Storage.prototype, "setItem");
    await open();
    await submit();
    await enter("assistantMessage", "Find the other order");
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Close assistant"]')
        ?.click(),
    );
    await clickText("Assistant");
    expect(control("assistantMessage").value).toBe("Find the other order");
    expect(document.querySelector('[role="log"]')?.textContent).toContain(
      "DEMO-001",
    );
    await clickText("New chat");
    expect(control("assistantMessage").value).toBe("");
    expect(document.querySelector('a[href="/orders/one"]')).toBeNull();
    expect(local).not.toHaveBeenCalled();
  });

  it("preserves failed questions and does not expose thrown diagnostic text", async () => {
    askAssistant.mockRejectedValueOnce(
      new Error("Private provider diagnostic"),
    );
    await open();
    await submit();
    expect(control("assistantMessage").value).toBe("Find Order DEMO-001");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "retained",
    );
    expect(document.body.textContent).not.toContain(
      "Private provider diagnostic",
    );
    await clickText("Send");
    expect(askAssistant).toHaveBeenCalledTimes(2);
    expect(control("assistantMessage").value).toBe("");
  });

  it("keeps a server-side limit error recoverable without clearing the draft", async () => {
    askAssistant.mockResolvedValueOnce({
      ok: false,
      code: "LIMIT",
      error: "Please wait before trying again.",
    });
    await open();
    await submit();
    expect(control("assistantMessage").value).toBe("Find Order DEMO-001");
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "Please wait before trying again.",
    );
  });

  it("blocks synchronous duplicate submissions while a request is pending", async () => {
    let finish: ((value: AssistantActionResult) => void) | undefined;
    askAssistant.mockImplementation(
      () =>
        new Promise<AssistantActionResult>((resolve) => {
          finish = resolve;
        }),
    );
    await open();
    await enter("assistantMessage", "Find Order DEMO-001");
    await act(async () => {
      const form = document.querySelector("form");
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(askAssistant).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      "Finding records",
    );
    expect(control("assistantMessage").hasAttribute("readonly")).toBe(true);
    await act(async () => finish?.(success));
    expect(control("assistantMessage").value).toBe("");
  });

  it("sends only the last four user questions, never result data, and caps display history", async () => {
    await open();
    for (let index = 0; index < 13; index++)
      await submit(`Find Project ${index}`);
    expect(askAssistant).toHaveBeenLastCalledWith({
      message: "Find Project 12",
      recentMessages: [
        "Find Project 8",
        "Find Project 9",
        "Find Project 10",
        "Find Project 11",
      ],
    });
    const log = document.querySelector('[role="log"]');
    expect(log?.textContent).not.toContain("Find Project 0");
    expect(
      log?.querySelectorAll('[aria-label="Matching records"]'),
    ).toHaveLength(12);
    expect(JSON.stringify(askAssistant.mock.calls)).not.toContain(
      "Sample Project",
    );
  });

  it("does not bypass record draft protection when opening a result", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    view = await mountForm(
      <>
        <DraftGuard>
          <form data-dirty="true">
            <input defaultValue="Business draft" />
          </form>
        </DraftGuard>
        <AssistantPanel />
      </>,
    );
    await clickText("Assistant");
    await submit();
    await act(async () =>
      document
        .querySelector<HTMLAnchorElement>('a[href="/orders/one"]')
        ?.click(),
    );
    expect(confirm).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(
      document.querySelector<HTMLInputElement>('form[data-dirty="true"] input')
        ?.value,
    ).toBe("Business draft");
  });

  it("closes on permitted record navigation without losing the conversation", async () => {
    await open();
    await submit();
    await act(async () =>
      document
        .querySelector<HTMLAnchorElement>('a[href="/orders/one"]')
        ?.click(),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await clickText("Assistant");
    expect(document.querySelector('a[href="/orders/one"]')).not.toBeNull();
  });

  it("renders record text literally rather than interpreting HTML", async () => {
    if (!success.ok) throw new Error("Missing test reply");
    askAssistant.mockResolvedValueOnce({
      ...success,
      reply: {
        ...success.reply,
        results: [
          {
            id: "safe",
            type: "Order",
            label: "<img src=x onerror=alert(1)>",
            context: "<script>example</script>",
            href: "/orders/safe",
          },
        ],
      },
    });
    await open();
    await submit();
    expect(
      document.querySelector('a[href="/orders/safe"]')?.textContent,
    ).toContain("<img src=x onerror=alert(1)>");
    expect(document.querySelector('[role="log"] img')).toBeNull();
    expect(document.querySelector('[role="log"] script')).toBeNull();
  });
});
