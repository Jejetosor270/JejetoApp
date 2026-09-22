import { describe, expect, it } from "vitest";
import {
  buildFinancialAttention,
  type AttentionDocument,
  type AttentionTerm,
} from "./attention";
import {
  attentionSnoozeSchema,
  isAttentionSnoozed,
  validSnoozeDate,
} from "./attention-snooze";

const today = "2026-09-22";
const term: AttentionTerm = {
  id: "term",
  dueDate: "2026-09-21",
  currency: "EUR",
  scheduled: "100.1000",
  paid: "10.0500",
  fx: null,
  cancelled: false,
  href: "/installments/supplier/term",
  actualFxMissing: false,
};
const doc: AttentionDocument = {
  id: "doc",
  side: "supplier",
  projectId: "project",
  projectName: "Project",
  reportingCurrency: "EUR",
  reference: "REF",
  partyId: "supplier",
  href: "/orders/doc",
  date: "2026-09-01",
  dueDate: null,
  currency: "EUR",
  totalHt: "80",
  totalTtc: "100.1000",
  paid: "10.0500",
  issued: true,
  toInvoice: false,
  fxMissing: false,
  actualFxMissing: false,
  terms: [term],
};
const project = {
  id: "project",
  name: "Project",
  currency: "EUR",
  actualMarkup: "0.10",
  targetMarkup: "0.20",
};
const build = (rows: AttentionDocument[], horizon: 7 | 30 | 90 = 7) =>
  buildFinancialAttention(rows, [project], today, horizon);

describe("financial attention", () => {
  it("uses exact remaining cash, preserves currency and labels provisional profitability", () => {
    const issues = build([doc]);
    expect(issues.find((row) => row.key === "term-due:term")).toMatchObject({
      priority: "Overdue",
      amount: "90.0500",
      currency: "EUR",
      basis: "TTC",
      href: term.href,
    });
    expect(issues.find((row) => row.key === "cash-gap-7:project")?.amount).toBe(
      "90.0500",
    );
    expect(
      issues.find((row) => row.key === "profitability:project")?.detail,
    ).toContain("Provisional");
  });
  it("keeps overdue rows in every horizon and includes the last selected day", () => {
    const next = {
      ...doc,
      id: "future",
      terms: [{ ...term, id: "future", dueDate: "2026-10-22" }],
    };
    expect(
      build([doc, next], 7).filter((row) => row.key.startsWith("term-due")),
    ).toHaveLength(1);
    expect(
      build([doc, next], 30).filter((row) => row.key.startsWith("term-due")),
    ).toHaveLength(2);
    expect(
      build(
        [{ ...next, terms: [{ ...term, dueDate: "2026-12-21" }] }],
        90,
      ).some((row) => row.priority === "Upcoming"),
    ).toBe(true);
  });
  it("removes settled terms and excludes unissued documents from cash and profitability contributions", () => {
    const settled = {
      ...doc,
      paid: "100.1000",
      terms: [{ ...term, paid: "100.1000" }],
    };
    expect(build([settled]).some((row) => row.key.startsWith("term-"))).toBe(
      false,
    );
    const planned = {
      ...doc,
      side: "client" as const,
      issued: false,
      toInvoice: true,
    };
    const issues = build([planned]);
    expect(issues.some((row) => row.key === "issue-invoice:doc")).toBe(true);
    expect(
      issues.some(
        (row) =>
          row.key.startsWith("cash-gap") || row.key.startsWith("term-due"),
      ),
    ).toBe(false);
    expect(
      build([{ ...planned, date: "2027-01-01" }]).some(
        (row) => row.key === "issue-invoice:doc",
      ),
    ).toBe(false);
  });
  it("shows missing due dates and FX without manufacturing a shortfall", () => {
    const issues = build([
      {
        ...doc,
        currency: "USD",
        fxMissing: true,
        terms: [{ ...term, currency: "USD", dueDate: null }],
      },
    ]);
    expect(issues.map((row) => row.key)).toEqual(
      expect.arrayContaining([
        "term-date:term",
        "document-fx:doc",
        "term-fx:term",
        "cash-incomplete:project",
      ]),
    );
    expect(issues.some((row) => row.key.startsWith("cash-gap"))).toBe(false);
  });
  it("does not compare unlike schedule currencies or count cancelled terms", () => {
    const issues = build([
      {
        ...doc,
        terms: [
          { ...term, currency: "USD", fx: "0.9" },
          { ...term, id: "cancelled", cancelled: true },
        ],
      },
    ]);
    expect(issues.find((row) => row.key === "schedule:doc")?.amount).toBeNull();
    expect(issues.some((row) => row.key.includes("cancelled"))).toBe(false);
    expect(issues.some((row) => row.key.startsWith("cash-gap"))).toBe(false);
  });
  it("flags unscheduled and overallocated balances and uses Invoice fallback due dates", () => {
    const noTerms = { ...doc, terms: [] };
    expect(build([noTerms]).map((row) => row.key)).toEqual(
      expect.arrayContaining(["schedule:doc", "missing-date:doc"]),
    );
    expect(
      build([{ ...doc, totalTtc: "90" }]).find(
        (row) => row.key === "schedule:doc",
      )?.amount,
    ).toBe("10.1000");
    const invoice = {
      ...doc,
      side: "client" as const,
      dueDate: "2026-09-20",
      terms: [{ ...term, dueDate: null }],
    };
    expect(
      build([invoice]).find((row) => row.key === "term-due:term")?.priority,
    ).toBe("Overdue");
    expect(build([invoice]).some((row) => row.key === "term-date:term")).toBe(
      false,
    );
  });
  it("only proposes duplicates for the same side, counterparty, date, amount and currency", () => {
    const second = { ...doc, id: "second", reference: "OTHER", terms: [] };
    expect(
      build([doc, second]).filter((row) => row.key.startsWith("duplicate")),
    ).toHaveLength(1);
    for (const change of [
      { partyId: "other" },
      { currency: "USD" },
      { side: "client" as const },
      { date: null },
      { totalTtc: "100.1001" },
    ]) {
      expect(
        build([doc, { ...second, ...change }]).some((row) =>
          row.key.startsWith("duplicate"),
        ),
      ).toBe(false);
    }
  });
  it("converts cash with term FX and includes freight exactly once", () => {
    const out = {
      ...doc,
      side: "freight" as const,
      currency: "USD",
      terms: [{ ...term, currency: "USD", fx: "0.9" }],
    };
    const incoming = {
      ...doc,
      id: "in",
      side: "client" as const,
      totalTtc: "20",
      paid: "0",
      terms: [{ ...term, id: "in", scheduled: "20", paid: "0" }],
    };
    expect(
      build([out, incoming]).find((row) => row.key === "cash-gap-7:project")
        ?.amount,
    ).toBe("61.0450");
    expect(
      build([out]).some((row) => row.title === "Freight payment due"),
    ).toBe(true);
  });
  it("does not claim below-target profitability when either rate is unavailable", () => {
    for (const change of [
      { actualMarkup: null },
      { targetMarkup: null },
      { actualMarkup: "0.20" },
    ]) {
      expect(
        buildFinancialAttention([], [{ ...project, ...change }], today, 7),
      ).toEqual([]);
    }
  });
  it("keeps actual FX separate even after a term has been paid", () => {
    const issues = build([
      {
        ...doc,
        paid: "100.1000",
        terms: [{ ...term, paid: "100.1000", actualFxMissing: true }],
      },
    ]);
    expect(issues.some((row) => row.key === "term-actual-fx:term")).toBe(true);
    expect(issues.some((row) => row.key === "term-due:term")).toBe(false);
  });
});

describe("personal snooze rules", () => {
  it("returns on the selected business date or when displayed information changes", () => {
    expect(
      isAttentionSnoozed(
        { fingerprint: "a" },
        { fingerprint: "a", until: "2026-09-23" },
        today,
      ),
    ).toBe(true);
    expect(
      isAttentionSnoozed(
        { fingerprint: "b" },
        { fingerprint: "a", until: "2026-09-23" },
        today,
      ),
    ).toBe(false);
    expect(
      isAttentionSnoozed(
        { fingerprint: "a" },
        { fingerprint: "a", until: today },
        today,
      ),
    ).toBe(false);
    expect(isAttentionSnoozed({ fingerprint: "a" }, undefined, today)).toBe(
      false,
    );
  });
  it("requires a reason and bounds future dates", () => {
    expect(validSnoozeDate(today, today)).toBe(false);
    expect(validSnoozeDate("2026-02-30", today)).toBe(false);
    expect(validSnoozeDate("2027-09-23", today)).toBe(false);
    expect(validSnoozeDate("2026-09-23", today)).toBe(true);
    const input = {
      key: "term-due:00000000-0000-4000-8000-000000000001",
      fingerprint: "a".repeat(64),
      horizon: 7,
      until: "2026-09-23",
      reason: " ",
    };
    expect(attentionSnoozeSchema.safeParse(input).success).toBe(false);
    expect(
      attentionSnoozeSchema.safeParse({
        ...input,
        reason: "Waiting for confirmation",
      }).success,
    ).toBe(true);
  });
});
