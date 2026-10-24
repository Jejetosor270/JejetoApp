import { describe, expect, it } from "vitest";
import {
  attentionFollowUpKey,
  attentionFollowUpSchema,
  attentionScopeForIssue,
  attentionWorkspaceQuery,
  consolidateHomeAttention,
  isAttentionDataQuality,
  matchesAttentionOwner,
  matchesAttentionScope,
} from "./attention-follow-up";

const id = "00000000-0000-4000-8000-000000000001";
describe("attention follow-up identity and view rules", () => {
  it("keeps ownership across horizons and money changes, without binding changing duplicate groups", () => {
    for (const horizon of [7, 30, 90])
      expect(attentionFollowUpKey(`cash-gap-${horizon}:${id}`)).toBe(
        `cash-gap:${id}`,
      );
    expect(attentionFollowUpKey(`term-due:${id}`)).toBe(`term-due:${id}`);
    expect(attentionFollowUpKey(`duplicate:${id}`)).toBeNull();
  });
  it("keeps cash actions separate from setup and reporting checks", () => {
    for (const kind of [
      "document-fx",
      "actual-fx",
      "term-fx",
      "term-actual-fx",
      "duplicate",
      "unassigned-cash",
      "archived-balance",
      "archived-refund-due-client",
      "profitability",
      "cash-gap-30",
      "future-unknown-check",
    ]) {
      const issue = { key: `${kind}:${id}` };
      expect(attentionScopeForIssue(issue)).toBe("data-quality");
      expect(isAttentionDataQuality(issue)).toBe(true);
      expect(matchesAttentionScope(issue, "payments")).toBe(false);
      expect(matchesAttentionScope(issue, "all")).toBe(true);
    }
    for (const kind of [
      "term-date",
      "missing-date",
      "schedule",
      "schedule-overflow",
      "cash-match",
      "cash-incomplete",
    ]) {
      const issue = { key: `${kind}:${id}` };
      expect(attentionScopeForIssue(issue)).toBe("payment-setup");
      expect(matchesAttentionScope(issue, "payment-setup")).toBe(true);
      expect(matchesAttentionScope(issue, "payments")).toBe(false);
      expect(matchesAttentionScope(issue, "all")).toBe(true);
    }
    for (const kind of [
      "term-due",
      "document-due",
      "issue-invoice",
      "refund-due-supplier",
      "refund-due-client",
      "refund-due-freight",
    ]) {
      const issue = { key: `${kind}:${id}` };
      expect(attentionScopeForIssue(issue)).toBe("payments");
      expect(matchesAttentionScope(issue, "payments")).toBe(true);
      expect(matchesAttentionScope(issue, "payment-setup")).toBe(false);
      expect(isAttentionDataQuality(issue)).toBe(false);
    }
    expect(
      attentionScopeForIssue({ key: `refund-due-client:${id}:credit-id` }),
    ).toBe("payments");
  });
  it("consolidates only duplicate missing-document dates for the exact schedule identity", () => {
    const schedule = { key: `schedule:${id}`, fingerprint: "unchanged" };
    const redundant = { key: `missing-date:${id}` };
    const otherDate = { key: `missing-date:${id}-other` };
    const termDate = { key: `term-date:${id}` };
    const overflow = { key: "schedule-overflow:other" };
    const overflowDate = { key: "missing-date:other" };
    const input = [
      redundant,
      otherDate,
      schedule,
      termDate,
      overflow,
      overflowDate,
    ];
    const result = consolidateHomeAttention(input);
    expect(result).toEqual([
      otherDate,
      schedule,
      termDate,
      overflow,
      overflowDate,
    ]);
    expect(result[1]).toBe(schedule);
    expect(input).toHaveLength(6);
    expect(input[0]).toBe(redundant);
  });
  it("preserves shared follow-ups and personal snoozes on redundant rows", () => {
    const schedule = { key: `schedule:${id}` };
    const owned = { key: `missing-date:${id}`, followUp: { assigneeId: id } };
    const noted = {
      key: `missing-date:${id}`,
      followUp: { note: "Check terms" },
    };
    const snoozed = {
      key: `missing-date:${id}`,
      snooze: { until: "2026-11-01" },
    };
    const redundant = {
      key: `missing-date:${id}`,
      followUp: null,
      snooze: null,
    };
    const result = consolidateHomeAttention([
      schedule,
      owned,
      noted,
      snoozed,
      redundant,
    ]);
    expect(result).toEqual([schedule, owned, noted, snoozed]);
    expect(result[1]).toBe(owned);
    expect(result[2]).toBe(noted);
    expect(result[3]).toBe(snoozed);
  });
  it("preserves existing overdue, action and upcoming ordering when filtering Home", () => {
    const issues = [
      { key: "term-due:overdue", priority: "Overdue" },
      { key: "issue-invoice:invoice", priority: "Action needed" },
      { key: "term-date:undated", priority: "Incomplete" },
      { key: "profitability:project", priority: "Review" },
      { key: "term-due:future", priority: "Upcoming" },
    ];
    expect(
      consolidateHomeAttention(issues)
        .filter((issue) => matchesAttentionScope(issue, "payments"))
        .map((issue) => issue.priority),
    ).toEqual(["Overdue", "Action needed", "Upcoming"]);
  });
  it("filters by shared owner without changing issue resolution", () => {
    expect(matchesAttentionOwner({ assigneeId: id }, "mine", id)).toBe(true);
    expect(matchesAttentionOwner({ assigneeId: id }, "mine", "another")).toBe(
      false,
    );
    expect(matchesAttentionOwner(null, "unassigned", id)).toBe(true);
    expect(matchesAttentionOwner({ assigneeId: id }, "unassigned", id)).toBe(
      false,
    );
    expect(matchesAttentionOwner(null, "all", id)).toBe(true);
  });
  it("preserves horizon, personal snooze, ownership, scope and page size in links", () => {
    expect(
      attentionWorkspaceQuery({
        horizon: 90,
        snoozed: true,
        owner: "mine",
        scope: "data-quality",
        pageSize: 50,
      }),
    ).toBe(
      "horizon=90&attention=snoozed&owner=mine&scope=data-quality&pageSize=50",
    );
  });
  it.each(["payments", "payment-setup", "data-quality", "all"] as const)(
    "preserves the %s scope in navigation and pagination links",
    (scope) => {
      expect(
        attentionWorkspaceQuery({
          horizon: 7,
          snoozed: false,
          owner: "unassigned",
          scope,
          pageSize: 100,
        }),
      ).toBe(
        `horizon=7&attention=active&owner=unassigned&scope=${scope}&pageSize=100`,
      );
    },
  );
  it("requires a version and validates dates, owner and bounded notes", () => {
    const input = {
      key: `term-due:${id}`,
      horizon: 30,
      version: null,
      assigneeId: id,
      nextFollowUpDate: "2026-09-01",
      note: "Follow up",
    };
    expect(attentionFollowUpSchema.safeParse(input).success).toBe(true);
    expect(
      attentionFollowUpSchema.safeParse({ ...input, version: undefined })
        .success,
    ).toBe(false);
    expect(
      attentionFollowUpSchema.safeParse({
        ...input,
        nextFollowUpDate: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      attentionFollowUpSchema.safeParse({ ...input, assigneeId: "employee" })
        .success,
    ).toBe(false);
    expect(
      attentionFollowUpSchema.safeParse({ ...input, note: "a".repeat(1001) })
        .success,
    ).toBe(false);
  });
});
