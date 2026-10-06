// @vitest-environment happy-dom
import { act, type AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantPanel } from "./assistant-panel";
import { DraftGuard } from "@/components/forms/draft-guard";
import type { AssistantActionResult } from "@/domain/assistant/contracts";
import {
  emptyAssistantFilters,
  type AssistantListQuery,
} from "@/domain/assistant/lists";
import { clickText, control, enter, mountForm } from "@/test/dom-form";

const { askAssistant, readAssistantList, readAssistantFinancial, location } =
  vi.hoisted(() => ({
    askAssistant: vi.fn(),
    readAssistantList: vi.fn(),
    readAssistantFinancial: vi.fn(),
    location: { path: "/" },
  }));
vi.mock("@/app/(app)/assistant-actions", () => ({
  askAssistant,
  readAssistantList,
  readAssistantFinancial,
}));
vi.mock("next/navigation", () => ({ usePathname: () => location.path }));
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
  location.path = "/";
  askAssistant.mockResolvedValue(success);
  readAssistantList.mockResolvedValue(success);
  readAssistantFinancial.mockResolvedValue(success);
});
afterEach(async () => {
  await view?.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function open() {
  view = await mountForm(<AssistantPanel />);
  await clickText("JejetoBot");
}

async function submit(message = "Find Order DEMO-001") {
  await enter("assistantMessage", message);
  await clickText("Send");
}

describe("JejetoBot panel", () => {
  it("opens a shared accessible drawer and returns bounded record links", async () => {
    await open();
    expect(document.activeElement).toBe(control("assistantMessage"));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Read-only ERP assistant",
    );
    expect(document.querySelector("form")?.dataset.draftGuard).toBe("off");
    expect(control("assistantMessage").getAttribute("maxlength")).toBe("800");
    await submit();
    expect(askAssistant).toHaveBeenCalledExactlyOnceWith({
      message: "Find Order DEMO-001",
      recentMessages: [],
      context: null,
      previousList: null,
      previousFinancial: null,
      pendingFinancialTopic: null,
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
        .querySelector<HTMLButtonElement>('[aria-label="Close JejetoBot"]')
        ?.click(),
    );
    await clickText("JejetoBot");
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
      "Checking your question",
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
      context: null,
      previousList: null,
      previousFinancial: null,
      pendingFinancialTopic: null,
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
    await clickText("JejetoBot");
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
    await clickText("JejetoBot");
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

const projectId = "10000000-0000-4000-8000-000000000001";
const supplierId = "10000000-0000-4000-8000-000000000002";
const listQuery: AssistantListQuery = {
  ...emptyAssistantFilters,
  kind: "Order",
  query: "",
  projectId,
  supplierId: null,
  clientId: null,
};

function listResult(page = 1): AssistantActionResult {
  if (!success.ok) throw new Error("Missing test reply");
  return {
    ok: true,
    reply: {
      ...success.reply,
      message: "Matching Orders.",
      query: null,
      truncated: false,
      moreHref: "/orders?projectId=example",
      moreLabel: "Open Purchasing",
      listing: {
        query: listQuery,
        page,
        pageSize: 2,
        total: 3,
        hasNext: page < 2,
        hasPrevious: page > 1,
        filters: ["Project: Demo", "Payment: Overdue"],
      },
    },
  };
}

describe("JejetoBot contextual lists", () => {
  it("reveals the newest question and list header without jumping during paging", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const log = document.querySelector<HTMLElement>('[role="log"]');
        const top = this.hasAttribute("data-assistant-turn")
          ? 900 - (log?.scrollTop ?? 0)
          : 0;
        return {
          top,
          bottom: top + 100,
          left: 0,
          right: 100,
          x: 0,
          y: top,
          width: 100,
          height: 100,
          toJSON: () => ({}),
        };
      },
    );
    askAssistant.mockResolvedValueOnce(listResult());
    readAssistantList.mockResolvedValueOnce(listResult(2));
    await open();
    const log = document.querySelector<HTMLElement>('[role="log"]');
    if (!log) throw new Error("Missing conversation");
    Object.defineProperty(log, "scrollHeight", {
      configurable: true,
      value: 4000,
    });
    await submit("List Orders");
    expect(log.scrollTop).toBe(900);
    log.scrollTop = 1500;
    await clickText("Next");
    expect(log.scrollTop).toBe(1500);
  });

  it("shows one list summary instead of repeating the numerical count", async () => {
    askAssistant.mockResolvedValueOnce(listResult());
    await open();
    await submit("List Orders");
    expect(document.querySelector('[role="log"]')?.textContent).not.toContain(
      "Matching Orders.",
    );
    expect(
      document.querySelectorAll('[aria-label="Result count"]'),
    ).toHaveLength(1);
  });

  it.each([
    { page: 1, total: 0 },
    { page: 2, total: 10 },
  ])(
    "keeps empty-page guidance without an invalid range ($page/$total)",
    async ({ page, total }) => {
      const response = listResult(page);
      if (!response.ok || !response.reply.listing)
        throw new Error("Missing list fixture");
      askAssistant.mockResolvedValueOnce({
        ok: true,
        reply: {
          ...response.reply,
          message:
            "No records on this page. Try an earlier page or different filters.",
          results: [],
          listing: { ...response.reply.listing, pageSize: 25, total },
        },
      });
      await open();
      await submit("List Orders");
      expect(
        document.querySelector('[aria-label="Result count"]')?.textContent,
      ).toBe(`0 shown · ${total} matches`);
      expect(document.querySelector('[role="log"]')?.textContent).toContain(
        "No records on this page.",
      );
      expect(document.querySelector('[role="log"]')?.textContent).not.toContain(
        "26–10",
      );
    },
  );

  it("pages the same reply without AI, extra turns or resetting a question draft", async () => {
    askAssistant.mockResolvedValueOnce(listResult());
    readAssistantList.mockResolvedValueOnce(listResult(2));
    await open();
    await submit("Orders for this Project");
    expect(
      document.querySelector('[aria-label="Result count"]')?.textContent,
    ).toBe("1–2 of 3 records");
    expect(
      document.querySelector('[aria-label="Applied filters"]')?.textContent,
    ).toContain("Project: Demo");
    expect(
      document.querySelector('a[href="/orders?projectId=example"]')
        ?.textContent,
    ).toContain("Open Purchasing");
    await enter("assistantMessage", "Only unpaid ones");
    await clickText("Next");
    expect(readAssistantList).toHaveBeenCalledExactlyOnceWith({
      query: listQuery,
      page: 2,
    });
    expect(askAssistant).toHaveBeenCalledOnce();
    expect(
      document.querySelectorAll('[aria-label="Matching records"]'),
    ).toHaveLength(1);
    expect(
      document.querySelector('[aria-label="Result count"]')?.textContent,
    ).toBe("3–3 of 3 records");
    expect(control("assistantMessage").value).toBe("Only unpaid ones");
    const next = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Next",
    );
    expect(next?.disabled).toBe(true);
    await clickText("Send");
    expect(askAssistant).toHaveBeenLastCalledWith({
      message: "Only unpaid ones",
      recentMessages: ["Orders for this Project"],
      previousList: { query: listQuery, page: 2 },
      previousFinancial: null,
      pendingFinancialTopic: null,
      context: null,
    });
  });

  it("keeps list scope when the current page changes and sends new context only on ask", async () => {
    location.path = `/projects/${projectId}`;
    askAssistant.mockResolvedValueOnce(listResult());
    readAssistantList.mockResolvedValueOnce(listResult(2));
    await open();
    expect(
      document.querySelector('[aria-label="Page context"]')?.textContent,
    ).toBe("Context: Project page");
    await submit("Orders for this Project");
    expect(askAssistant).toHaveBeenLastCalledWith(
      expect.objectContaining({
        context: { kind: "Project", id: projectId },
      }),
    );
    location.path = `/orders/${supplierId}`;
    await enter("assistantMessage", "Show overdue ones");
    expect(
      document.querySelector('[aria-label="Page context"]')?.textContent,
    ).toBe("Context: Order page");
    await clickText("Next");
    expect(readAssistantList).toHaveBeenLastCalledWith({
      query: listQuery,
      page: 2,
    });
    await clickText("Send");
    expect(askAssistant).toHaveBeenLastCalledWith(
      expect.objectContaining({
        context: { kind: "Order", id: supplierId },
        previousList: { query: listQuery, page: 2 },
      }),
    );
  });

  it("selects an ambiguous relation while preserving all other filters", async () => {
    const query = {
      ...listQuery,
      supplier: "Acme",
      paymentStatus: "OVERDUE" as const,
    };
    askAssistant.mockResolvedValueOnce({
      ok: true,
      reply: {
        message: "Which Supplier?",
        query: null,
        moreHref: null,
        truncated: false,
        results: [],
        clarification: {
          query,
          choices: [
            {
              field: "supplierId",
              id: supplierId,
              label: "Acme France",
              context: "Paris",
            },
            {
              field: "supplierId",
              id: projectId,
              label: "Acme UK",
              context: "London",
            },
          ],
        },
      },
    });
    readAssistantList.mockResolvedValueOnce(listResult());
    await open();
    await submit("Overdue Orders for supplier Acme");
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Choose a record"] button',
        )
        ?.click();
    });
    expect(readAssistantList).toHaveBeenCalledExactlyOnceWith({
      query: { ...query, supplierId },
      page: 1,
    });
    expect(askAssistant).toHaveBeenCalledOnce();
    expect(document.querySelector('[aria-label="Choose a record"]')).toBeNull();
    expect(
      document.querySelectorAll('[aria-label="Matching records"]'),
    ).toHaveLength(1);
  });

  it("retains list results and prompt after a pagination failure", async () => {
    askAssistant.mockResolvedValueOnce(listResult());
    readAssistantList.mockResolvedValueOnce({
      ok: false,
      code: "LIMIT",
      error: "Please try again shortly.",
    });
    await open();
    await submit("List Orders");
    await enter("assistantMessage", "My next question");
    await clickText("Next");
    expect(
      document.querySelector('[aria-label="Result count"]')?.textContent,
    ).toBe("1–2 of 3 records");
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "Please try again shortly.",
    );
    expect(control("assistantMessage").value).toBe("My next question");
    readAssistantList.mockRejectedValueOnce(new Error("Private details"));
    await clickText("Next");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "results are retained",
    );
    expect(document.body.textContent).not.toContain("Private details");
  });

  it("blocks duplicate page requests synchronously", async () => {
    askAssistant.mockResolvedValueOnce(listResult());
    let finish: ((value: AssistantActionResult) => void) | undefined;
    readAssistantList.mockImplementationOnce(
      () =>
        new Promise<AssistantActionResult>((resolve) => {
          finish = resolve;
        }),
    );
    await open();
    await submit("List Orders");
    await act(async () => {
      const next = [...document.querySelectorAll("button")].find(
        (button) => button.textContent === "Next",
      );
      next?.click();
      next?.click();
    });
    expect(readAssistantList).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      "Loading records",
    );
    await act(async () => finish?.(listResult(2)));
  });

  it("clears remembered list, choices and questions with New chat", async () => {
    askAssistant.mockResolvedValueOnce(listResult());
    await open();
    await submit("List Orders");
    await clickText("New chat");
    expect(document.querySelector('[aria-label="Result count"]')).toBeNull();
    expect(document.querySelector('[aria-label="Choose a record"]')).toBeNull();
    await submit("List Suppliers");
    expect(askAssistant).toHaveBeenLastCalledWith({
      message: "List Suppliers",
      recentMessages: [],
      context: null,
      previousList: null,
      previousFinancial: null,
      pendingFinancialTopic: null,
    });
  });

  it("does not turn list/create pages into record context", async () => {
    location.path = "/orders/new";
    await open();
    expect(document.querySelector('[aria-label="Page context"]')).toBeNull();
    await submit();
    expect(askAssistant).toHaveBeenLastCalledWith(
      expect.objectContaining({ context: null }),
    );
  });
});

const financialScope = { projectId, topic: "cash" as const };
const financialResult: AssistantActionResult = {
  ok: true,
  reply: {
    message: "Project cash summary.",
    query: null,
    results: [],
    truncated: false,
    moreHref: null,
    financial: financialScope,
    answer: {
      title: "Demo Villa · Cash",
      paragraphs: [
        "Recorded receipts less payments. This is not a bank balance.",
      ],
      metrics: [
        {
          label: "Net cash TTC",
          value: "12 345.67 EUR",
          href: `/projects/${projectId}?metric=net_cash`,
        },
        { label: "To collect TTC", value: null },
      ],
      sources: [
        { label: "INV-DEMO", href: "/billing/demo", note: "Client receipt" },
      ],
      sourceCount: 10,
      warnings: ["A receipt has missing FX."],
      links: [{ label: "Open Project", href: `/projects/${projectId}` }],
      asOf: "06/10/2026",
    },
  },
};

const financialChoice: AssistantActionResult = {
  ok: true,
  reply: {
    message: "Which Project?",
    query: null,
    results: [],
    truncated: false,
    moreHref: null,
    financialClarification: {
      topic: "cash",
      choices: [{ id: projectId, label: "Demo Villa", context: "Demo Client" }],
    },
    pendingFinancialTopic: "cash",
  },
};

const missingFinancialProject: AssistantActionResult = {
  ok: true,
  reply: {
    message: "No matching Project. Which Project did you mean?",
    query: null,
    results: [],
    truncated: false,
    moreHref: null,
    pendingFinancialTopic: "costs_profit",
  },
};

describe("JejetoBot help and Project answers", () => {
  it("renders trusted formatted metrics, incomplete values, warnings and linked evidence", async () => {
    askAssistant.mockResolvedValueOnce(financialResult);
    await open();
    await submit("Explain this Project's cash");
    const answer = document.querySelector('[aria-label="Demo Villa · Cash"]');
    expect(answer?.textContent).toContain("12 345.67 EUR");
    expect(answer?.textContent).toContain("Incomplete");
    expect(answer?.textContent).toContain("As of 06/10/2026");
    expect(answer?.textContent).not.toContain("Project cash summary.");
    expect(answer?.querySelector("dd")?.className).toContain("text-right");
    expect(answer?.querySelector("dd")?.className).toContain("tabular-nums");
    expect(
      answer?.querySelector('[aria-label="Review warnings"]')?.textContent,
    ).toContain("missing FX");
    expect(answer?.querySelector("details")?.open).toBe(false);
    expect(answer?.querySelector("summary")?.textContent).toBe("Sources (10)");
    expect(
      answer
        ?.querySelector('a[href="/billing/demo"]')
        ?.getAttribute("data-prefetch"),
    ).toBe("false");
    expect(answer?.textContent).toContain("Showing 1 of 10 sources");
  });

  it("renders application help steps as text with normal guarded navigation", async () => {
    askAssistant.mockResolvedValueOnce({
      ok: true,
      reply: {
        message: "Help",
        query: null,
        results: [],
        moreHref: null,
        truncated: false,
        answer: {
          title: "Record a receipt",
          paragraphs: ["Only issued Invoices can receive cash."],
          steps: ["Open Billing.", "Open payment terms.", "Choose Mark paid."],
          links: [{ label: "Open Billing", href: "/billing" }],
        },
      },
    });
    await open();
    await submit("How do I record a receipt?");
    expect(
      document.querySelectorAll('[aria-label="Record a receipt"] ol li'),
    ).toHaveLength(3);
    await enter("assistantMessage", "My next question");
    await act(async () =>
      document.querySelector<HTMLAnchorElement>('a[href="/billing"]')?.click(),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await clickText("JejetoBot");
    expect(control("assistantMessage").value).toBe("My next question");
  });

  it("remembers only a Project ID and topic for follow-ups, not amounts or evidence", async () => {
    location.path = `/projects/${projectId}`;
    askAssistant.mockResolvedValueOnce(financialResult);
    await open();
    await submit("Explain this Project's cash");
    await submit("And its VAT?");
    const request = askAssistant.mock.lastCall?.[0];
    expect(request).toEqual({
      message: "And its VAT?",
      recentMessages: ["Explain this Project's cash"],
      context: { kind: "Project", id: projectId },
      previousList: null,
      previousFinancial: financialScope,
      pendingFinancialTopic: null,
    });
    expect(JSON.stringify(request)).not.toContain("12 345.67");
    expect(JSON.stringify(request)).not.toContain("INV-DEMO");
    expect(JSON.stringify(request)).not.toContain("Demo Villa");
  });

  it("resolves an ambiguous Project without AI and preserves the question draft", async () => {
    askAssistant.mockResolvedValueOnce(financialChoice);
    readAssistantFinancial.mockResolvedValueOnce(financialResult);
    await open();
    await submit("Show cash for Villa");
    await enter("assistantMessage", "And its VAT?");
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Choose a Project"] button',
        )
        ?.click(),
    );
    expect(readAssistantFinancial).toHaveBeenCalledExactlyOnceWith(
      financialScope,
    );
    expect(askAssistant).toHaveBeenCalledOnce();
    expect(
      document.querySelector('[aria-label="Choose a Project"]'),
    ).toBeNull();
    expect(
      document.querySelector('[aria-label="Demo Villa · Cash"]'),
    ).not.toBeNull();
    expect(control("assistantMessage").value).toBe("And its VAT?");
    await clickText("Send");
    expect(askAssistant).toHaveBeenLastCalledWith(
      expect.objectContaining({ previousFinancial: financialScope }),
    );
  });

  it("retains financial choices and drafts on failure without showing private diagnostics", async () => {
    askAssistant.mockResolvedValueOnce(financialChoice);
    readAssistantFinancial.mockResolvedValueOnce({
      ok: false,
      code: "LIMIT",
      error: "Try again shortly.",
    });
    await open();
    await submit("Show cash for Villa");
    await enter("assistantMessage", "Draft question");
    const choose = () =>
      act(async () =>
        document
          .querySelector<HTMLButtonElement>(
            '[aria-label="Choose a Project"] button',
          )
          ?.click(),
      );
    await choose();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "Try again shortly.",
    );
    expect(
      document.querySelector('[aria-label="Choose a Project"]'),
    ).not.toBeNull();
    expect(control("assistantMessage").value).toBe("Draft question");
    readAssistantFinancial.mockRejectedValueOnce(
      new Error("Private diagnostic"),
    );
    await choose();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "retained",
    );
    expect(document.body.textContent).not.toContain("Private diagnostic");
    expect(control("assistantMessage").value).toBe("Draft question");
  });

  it("blocks repeated Project selections while a request is pending", async () => {
    askAssistant.mockResolvedValueOnce(financialChoice);
    let finish: ((result: AssistantActionResult) => void) | undefined;
    readAssistantFinancial.mockImplementationOnce(
      () =>
        new Promise<AssistantActionResult>((resolve) => {
          finish = resolve;
        }),
    );
    await open();
    await submit("Show cash for Villa");
    await act(async () => {
      const button = document.querySelector<HTMLButtonElement>(
        '[aria-label="Choose a Project"] button',
      );
      button?.click();
      button?.click();
    });
    expect(readAssistantFinancial).toHaveBeenCalledOnce();
    expect(
      document.querySelector<HTMLButtonElement>(
        '[aria-label="Choose a Project"] button',
      )?.disabled,
    ).toBe(true);
    await act(async () => finish?.(financialResult));
  });

  it("retains list scope alongside financial context and clears both in New chat", async () => {
    askAssistant
      .mockResolvedValueOnce(listResult())
      .mockResolvedValueOnce(financialResult);
    await open();
    await submit("List Orders");
    await submit("Show Project cash");
    await submit("Only overdue Orders");
    expect(askAssistant).toHaveBeenLastCalledWith(
      expect.objectContaining({
        previousList: { query: listQuery, page: 1 },
        previousFinancial: financialScope,
      }),
    );
    await clickText("New chat");
    expect(
      document.querySelector('[aria-label="Demo Villa · Cash"]'),
    ).toBeNull();
    await submit("Find something else");
    expect(askAssistant).toHaveBeenLastCalledWith(
      expect.objectContaining({
        recentMessages: [],
        previousList: null,
        previousFinancial: null,
      }),
    );
  });

  it.each([
    ["ambiguous Project", financialChoice],
    [
      "unavailable Project",
      {
        ok: true,
        reply: {
          message: "No matching Project found.",
          query: null,
          results: [],
          truncated: false,
          moreHref: null,
        },
      },
    ],
    ["list", listResult()],
    [
      "help",
      {
        ok: true,
        reply: {
          message: "Help",
          query: null,
          results: [],
          truncated: false,
          moreHref: null,
          answer: {
            title: "Payments",
            paragraphs: ["Open payment terms."],
            links: [],
          },
        },
      },
    ],
  ] as const)(
    "clears financial scope after a successful %s reply",
    async (_name, response) => {
      askAssistant
        .mockResolvedValueOnce(financialResult)
        .mockResolvedValueOnce(response);
      await open();
      await submit("Explain Demo Villa's cash");
      await submit("Tell me about another Project");
      await submit("And its VAT?");
      expect(askAssistant).toHaveBeenLastCalledWith(
        expect.objectContaining({ previousFinancial: null }),
      );
    },
  );

  it.each(["rejection", "transport"])(
    "retains financial scope and draft after %s failure",
    async (failure) => {
      askAssistant.mockResolvedValueOnce(financialResult);
      if (failure === "transport")
        askAssistant.mockRejectedValueOnce(new Error("Private failure"));
      else
        askAssistant.mockResolvedValueOnce({
          ok: false,
          code: "LIMIT",
          error: "Try again.",
        });
      await open();
      await submit("Explain Demo Villa's cash");
      await submit("And its VAT?");
      expect(control("assistantMessage").value).toBe("And its VAT?");
      await clickText("Send");
      expect(askAssistant).toHaveBeenLastCalledWith(
        expect.objectContaining({ previousFinancial: financialScope }),
      );
    },
  );

  it("carries the unanswered topic into a corrected name without the previous Project", async () => {
    askAssistant
      .mockResolvedValueOnce(financialResult)
      .mockResolvedValueOnce(missingFinancialProject)
      .mockResolvedValueOnce(financialResult);
    await open();
    await submit("Explain Demo Villa cash");
    await submit("What is the profit for Vilas Bled?");
    await submit("villas bled");
    expect(askAssistant).toHaveBeenLastCalledWith({
      message: "villas bled",
      recentMessages: [
        "Explain Demo Villa cash",
        "What is the profit for Vilas Bled?",
      ],
      context: null,
      previousList: null,
      previousFinancial: null,
      pendingFinancialTopic: "costs_profit",
    });
    const correction = JSON.stringify(askAssistant.mock.lastCall?.[0]);
    expect(correction).not.toContain(projectId);
    expect(correction).not.toContain("12 345.67");
    expect(correction).not.toContain("INV-DEMO");
    await submit("And its VAT?");
    expect(askAssistant).toHaveBeenLastCalledWith(
      expect.objectContaining({
        previousFinancial: financialScope,
        pendingFinancialTopic: null,
      }),
    );
  });

  it("keeps only the ambiguous topic when the user types a corrected Project name", async () => {
    askAssistant
      .mockResolvedValueOnce(financialResult)
      .mockResolvedValueOnce(financialChoice);
    await open();
    await submit("Explain Demo Villa cash");
    await submit("Show cash for Villa");
    await submit("villas bled");
    expect(askAssistant).toHaveBeenLastCalledWith(
      expect.objectContaining({
        previousFinancial: null,
        pendingFinancialTopic: "cash",
      }),
    );
    expect(JSON.stringify(askAssistant.mock.lastCall?.[0])).not.toContain(
      projectId,
    );
  });

  it("clears an ambiguous topic after Project selection", async () => {
    askAssistant.mockResolvedValueOnce(financialChoice);
    readAssistantFinancial.mockResolvedValueOnce(financialResult);
    await open();
    await submit("Show cash for Villa");
    await enter("assistantMessage", "And its VAT?");
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Choose a Project"] button',
        )
        ?.click(),
    );
    await clickText("Send");
    expect(askAssistant).toHaveBeenLastCalledWith(
      expect.objectContaining({
        previousFinancial: financialScope,
        pendingFinancialTopic: null,
      }),
    );
  });

  it.each([
    ["list", listResult()],
    [
      "help",
      {
        ok: true,
        reply: {
          message: "Help",
          query: null,
          results: [],
          truncated: false,
          moreHref: null,
          answer: {
            title: "Payments",
            paragraphs: ["Open payment terms."],
            links: [],
          },
        },
      },
    ],
  ] as const)(
    "clears pending financial topics after unrelated %s answers",
    async (_kind, response) => {
      askAssistant
        .mockResolvedValueOnce(missingFinancialProject)
        .mockResolvedValueOnce(response);
      await open();
      await submit("What is profit for Vilas Bled?");
      await submit("Other question");
      await submit("villas bled");
      expect(askAssistant).toHaveBeenLastCalledWith(
        expect.objectContaining({
          previousFinancial: null,
          pendingFinancialTopic: null,
        }),
      );
    },
  );

  it("clears a pending financial topic with New chat", async () => {
    askAssistant.mockResolvedValueOnce(missingFinancialProject);
    await open();
    await submit("What is profit for Vilas Bled?");
    await clickText("New chat");
    await submit("villas bled");
    expect(askAssistant).toHaveBeenLastCalledWith(
      expect.objectContaining({
        recentMessages: [],
        previousFinancial: null,
        pendingFinancialTopic: null,
      }),
    );
  });

  it.each(["rejection", "transport"])(
    "preserves an unanswered topic and correction draft after %s failure",
    async (failure) => {
      askAssistant.mockResolvedValueOnce(missingFinancialProject);
      if (failure === "transport")
        askAssistant.mockRejectedValueOnce(new Error("Private failure"));
      else
        askAssistant.mockResolvedValueOnce({
          ok: false,
          code: "LIMIT",
          error: "Try again.",
        });
      await open();
      await submit("What is profit for Vilas Bled?");
      await submit("villas bled");
      expect(control("assistantMessage").value).toBe("villas bled");
      await clickText("Send");
      expect(askAssistant).toHaveBeenLastCalledWith(
        expect.objectContaining({
          previousFinancial: null,
          pendingFinancialTopic: "costs_profit",
        }),
      );
      expect(JSON.stringify(askAssistant.mock.lastCall?.[0])).not.toContain(
        projectId,
      );
    },
  );

  it("treats answer and source text literally", async () => {
    if (!financialResult.ok || !financialResult.reply.answer)
      throw new Error("Missing fixture");
    askAssistant.mockResolvedValueOnce({
      ok: true,
      reply: {
        ...financialResult.reply,
        answer: {
          ...financialResult.reply.answer,
          title: "<script>example</script>",
          paragraphs: ["<img src=x onerror=alert(1)>"],
        },
      },
    });
    await open();
    await submit("Explain Project cash");
    expect(document.querySelector('[role="log"]')?.textContent).toContain(
      "<img src=x onerror=alert(1)>",
    );
    expect(document.querySelector('[role="log"] img')).toBeNull();
    expect(document.querySelector('[role="log"] script')).toBeNull();
  });
});
