import { describe, expect, it } from "vitest";
import {
  attentionFollowUpKey,
  attentionFollowUpSchema,
  attentionWorkspaceQuery,
  isAttentionDataQuality,
  matchesAttentionOwner,
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
  it("classifies quality without turning all financial warnings into missing-data issues", () => {
    for (const kind of [
      "document-fx",
      "term-date",
      "schedule",
      "cash-match",
      "duplicate",
      "unassigned-cash",
      "archived-balance",
    ])
      expect(isAttentionDataQuality({ key: `${kind}:${id}` })).toBe(true);
    for (const kind of [
      "term-due",
      "issue-invoice",
      "profitability",
      "cash-gap-30",
    ])
      expect(isAttentionDataQuality({ key: `${kind}:${id}` })).toBe(false);
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
