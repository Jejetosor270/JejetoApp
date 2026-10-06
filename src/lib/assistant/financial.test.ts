import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ project: vi.fn(), control: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({ project: { findUnique: mocks.project } }),
}));
vi.mock("@/lib/reporting/project-control", () => ({
  getProjectControl: mocks.control,
}));

import { readAssistantFinancials } from "./financial";
import { assistantFinancialTopics } from "@/domain/assistant/answers";
import {
  projectMetricKeys,
  type ProjectDashboard,
  type ProjectMetric,
  type ProjectMetricKey,
} from "@/domain/finance/project-dashboard";

const projectId = "00000000-0000-4000-8000-000000000001";
const href = `/projects/${projectId}`;
let dashboard: ProjectDashboard;

function metric(value: string | null): ProjectMetric {
  return { value, rows: [], help: "Canonical explanation." };
}
function value(
  label: string,
  answer: Awaited<ReturnType<typeof readAssistantFinancials>>,
) {
  return answer.answer?.metrics?.find((row) => row.label === label)?.value;
}

beforeEach(() => {
  vi.resetAllMocks();
  dashboard = {
    metrics: Object.fromEntries(
      projectMetricKeys.map((key) => [key, metric("0.0000")]),
    ) as Record<ProjectMetricKey, ProjectMetric>,
    markupRate: null,
    expectedMarkupRate: null,
    alerts: [],
  };
  mocks.project.mockResolvedValue({
    id: projectId,
    name: "Fictional Villa",
    code: "VILLA",
  });
  mocks.control.mockResolvedValue({ currency: "EUR", dashboard });
});

describe("JejetoBot Project financial answers", () => {
  it("verifies the visible Project before loading any financial totals", async () => {
    mocks.project.mockResolvedValue(null);
    const reply = await readAssistantFinancials({
      projectId,
      topic: "overview",
    });
    expect(mocks.project).toHaveBeenCalledWith({
      where: { id: projectId },
      select: { id: true, name: true, code: true },
    });
    expect(mocks.control).not.toHaveBeenCalled();
    expect(reply.answer).toBeUndefined();
    expect(reply.financial).toBeUndefined();
    expect(reply.message).toContain("no longer available");
  });

  it("rejects invalid IDs before a database read", async () => {
    await expect(
      readAssistantFinancials({
        projectId: "../another-project",
        topic: "overview",
      }),
    ).rejects.toThrow();
    expect(mocks.project).not.toHaveBeenCalled();
    expect(mocks.control).not.toHaveBeenCalled();
  });

  it("rejects client-supplied financial values", async () => {
    await expect(
      readAssistantFinancials({
        projectId,
        topic: "overview",
        value: "999999",
      } as never),
    ).rejects.toThrow();
    expect(mocks.project).not.toHaveBeenCalled();
  });

  it("uses exact canonical cost, credit-adjusted profit and markup without recalculating rows", async () => {
    dashboard.metrics.cost = {
      ...metric("123456.7812"),
      rows: [{ label: "Source", href: "/orders/source", amount: "1" }],
    };
    dashboard.metrics.sell = metric("140000.0030");
    dashboard.metrics.profit = metric("16543.2218");
    dashboard.markupRate = "0.134000";
    const reply = await readAssistantFinancials({
      projectId,
      topic: "costs_profit",
    });
    expect(mocks.control).toHaveBeenCalledExactlyOnceWith(projectId);
    expect(value("Recorded cost", reply)).toBe("123 456.78 EUR");
    expect(value("Order sell HT", reply)).toBe("140 000.00 EUR");
    expect(value("Pricing profit", reply)).toBe("16 543.22 EUR");
    expect(value("Markup", reply)).toBe("13.4%");
    expect(reply.answer?.paragraphs.join(" ")).toContain(
      "not earned or final Project profit",
    );
    expect(reply.financial).toEqual({ projectId, topic: "costs_profit" });
    expect(reply.answer?.links).toEqual([{ label: "Open Project", href }]);
    expect(reply.moreHref).toBeNull();
    expect(reply.results).toEqual([]);
    expect(reply.truncated).toBe(false);
  });

  it.each([
    ["-48125.3800", "billing shortfall, not necessarily a loss"],
    ["0.0000", "exactly covers Order sell"],
    ["10.0000", "exceeds Order sell"],
    [null, "coverage is incomplete"],
  ])(
    "explains issued coverage %s without confusing it with cash or allocations",
    async (coverage, conclusion) => {
      dashboard.metrics.invoiced = metric("353143.7000");
      dashboard.metrics.sell = metric("401269.0800");
      dashboard.metrics.coverage = metric(coverage);
      dashboard.metrics.planned = metric("632705.2900");
      dashboard.metrics.toInvoice = metric("279561.5900");
      const reply = await readAssistantFinancials({
        projectId,
        topic: "billing_coverage",
      });
      expect(value("Invoiced HT", reply)).toBe("353 143.70 EUR");
      expect(value("To invoice HT", reply)).toBe("279 561.59 EUR");
      expect(reply.answer?.paragraphs.join(" ")).toContain(conclusion);
      expect(reply.answer?.paragraphs.join(" ")).toContain(
        "allocation approval does not limit",
      );
      expect(reply.answer?.paragraphs.join(" ")).toContain(
        "Planned Billing, VAT and cash do not fund",
      );
      if (coverage === null)
        expect(value("Order coverage HT", reply)).toBeNull();
    },
  );

  it("preserves canonical net receipts/refunds and independent cash FX", async () => {
    dashboard.metrics.received = metric("900.1234");
    dashboard.metrics.paid = metric("400.3210");
    dashboard.metrics.cash = metric("499.8024");
    dashboard.metrics.toCollect = metric("300.0000");
    dashboard.metrics.toPay = metric("20.0000");
    const reply = await readAssistantFinancials({ projectId, topic: "cash" });
    expect(reply.answer?.metrics?.map((row) => row.value)).toEqual([
      "900.12 EUR",
      "400.32 EUR",
      "499.80 EUR",
      "300.00 EUR",
      "20.00 EUR",
    ]);
    const text = reply.answer?.paragraphs.join(" ");
    expect(text).toContain("credits alone create no cash");
    expect(text).toContain("Each cash transaction");
    expect(text).toContain("excluding planned Billing");
    expect(text).toContain("not a timed cash forecast or bank balance");
  });

  it("keeps missing FX unknown while preserving complete neighboring amounts", async () => {
    dashboard.metrics.received = {
      ...metric(null),
      rows: [
        {
          label: "INV-USD",
          href: "/receipts/foreign",
          amount: null,
          note: "Recognized actual Client receipt; independent actual FX.",
        },
      ],
    };
    dashboard.metrics.paid = metric("40.0000");
    dashboard.metrics.cash = metric(null);
    const reply = await readAssistantFinancials({ projectId, topic: "cash" });
    expect(value("Client received TTC", reply)).toBeNull();
    expect(value("Net cash TTC", reply)).toBeNull();
    expect(value("Supplier paid TTC", reply)).toBe("40.00 EUR");
    expect(reply.answer?.warnings?.[0]).toContain("not zero");
    expect(reply.answer?.sources?.[0]).toMatchObject({
      label: "INV-USD",
      note: expect.stringContaining("Incomplete amount"),
    });
  });

  it("distinguishes zero-denominator markup from incomplete inputs", async () => {
    let reply = await readAssistantFinancials({
      projectId,
      topic: "costs_profit",
    });
    expect(value("Recorded cost", reply)).toBe("0.00 EUR");
    expect(value("Markup", reply)).toBe("Not applicable");
    dashboard.metrics.sell.value = null;
    reply = await readAssistantFinancials({ projectId, topic: "costs_profit" });
    expect(value("Markup", reply)).toBeNull();
    dashboard.metrics.cost.value = null;
    reply = await readAssistantFinancials({ projectId, topic: "costs_profit" });
    expect(value("Markup", reply)).toBeNull();
  });

  it("shows unique bounded source links with unknown sources first without changing totals", async () => {
    dashboard.metrics.cost = {
      value: "1000.0000",
      help: "All sources.",
      rows: Array.from({ length: 12 }, (_, index) => ({
        label: `Order ${index}`,
        href: `/orders/${index}`,
        amount: "10",
      })),
    };
    dashboard.metrics.cost.rows.push({
      label: "Missing FX",
      href: "/orders/missing",
      amount: null,
    });
    dashboard.metrics.sell.rows = [...dashboard.metrics.cost.rows];
    const reply = await readAssistantFinancials({
      projectId,
      topic: "costs_profit",
    });
    expect(value("Recorded cost", reply)).toBe("1 000.00 EUR");
    expect(reply.answer?.sourceCount).toBe(13);
    expect(reply.answer?.sources).toHaveLength(8);
    expect(reply.answer?.sources?.[0]?.label).toBe("Missing FX");
    expect(new Set(reply.answer?.sources?.map((row) => row.href)).size).toBe(8);
    expect(reply.truncated).toBe(false);
  });

  it("uses returned reporting currency rather than a hardcoded currency", async () => {
    dashboard.metrics.vatOutput.value = "123.4567";
    dashboard.metrics.vatInput.value = "200.0000";
    dashboard.metrics.vatBalance.value = "-76.5433";
    mocks.control.mockResolvedValue({ currency: "CHF", dashboard });
    const reply = await readAssistantFinancials({ projectId, topic: "vat" });
    expect(value("Output VAT", reply)).toBe("123.46 CHF");
    expect(value("VAT balance", reply)).toBe("-76.54 CHF");
    expect(reply.answer?.paragraphs.join(" ")).toContain(
      "negative means a VAT credit",
    );
    expect(reply.answer?.paragraphs.join(" ")).toContain(
      "not a tax filing calculation",
    );
  });

  it("does not mislabel freight attribution as new cash or revenue", async () => {
    dashboard.metrics.freightCost.value = "100.0000";
    dashboard.metrics.freightTarget.value = "115.0000";
    dashboard.metrics.freightInvoiced.value = "110.0000";
    dashboard.metrics.freightReceived.value = "50.0000";
    dashboard.metrics.freightInvoicedGap.value = "-5.0000";
    dashboard.metrics.freightPaidGap.value = "-65.0000";
    const reply = await readAssistantFinancials({
      projectId,
      topic: "freight",
    });
    expect(value("Freight target HT", reply)).toBe("115.00 EUR");
    expect(value("Paid coverage HT", reply)).toBe("-65.00 EUR");
    expect(reply.answer?.paragraphs.join(" ")).toContain(
      "not an extra receipt or revenue",
    );
  });

  it("preserves cash review warnings without unrelated budget noise", async () => {
    dashboard.alerts = [
      {
        label: "Excluded receipt",
        href: "/receipts/excluded",
        note: "Unrecognized cash excluded.",
      },
      {
        label: "Cost payable review",
        href: "/orders/payable",
        note: "Review additional cost payment coverage.",
      },
      { label: "Budget incomplete", href, note: "Budget missing." },
    ];
    const reply = await readAssistantFinancials({ projectId, topic: "cash" });
    expect(reply.answer?.warnings).toEqual([
      "Unrecognized cash excluded.",
      "Review additional cost payment coverage.",
    ]);
  });

  it.each(assistantFinancialTopics)(
    "returns concise labels and an as-of timestamp for %s",
    async (topic) => {
      const reply = await readAssistantFinancials({ projectId, topic });
      expect(reply.answer?.title).toContain("Fictional Villa");
      expect(reply.answer?.asOf).toMatch(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/);
      for (const entry of reply.answer?.metrics ?? [])
        expect(entry.label.split(" ").length).toBeLessThanOrEqual(4);
    },
  );

  it("does not convert service failures into financial zeros", async () => {
    mocks.control.mockRejectedValue(new Error("Reporting unavailable"));
    await expect(
      readAssistantFinancials({ projectId, topic: "overview" }),
    ).rejects.toThrow("Reporting unavailable");
  });
});
