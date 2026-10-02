import type { InputHTMLAttributes, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireEditor: vi.fn(),
  events: vi.fn(),
  actors: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireMasterDataEditor: state.requireEditor,
}));
vi.mock("@/lib/audit/events", () => ({
  listAuditEvents: state.events,
  listAuditActors: state.actors,
}));
vi.mock("@/components/layout/settings-navigation", () => ({
  SettingsNavigation: () => null,
}));
vi.mock("@/components/listing/filter-bar", () => ({
  FilterBar: ({ children }: { children: ReactNode }) => <form>{children}</form>,
}));
vi.mock("@/components/forms/date-input", () => ({
  DateInput: (props: InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));
vi.mock("@/components/listing/page-size-control", () => ({
  PageSizeControl: () => null,
}));

import ActivityPage from "./page";

const entityId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("record-scoped Activity page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.requireEditor.mockResolvedValue({ role: "MANAGER" });
    state.events.mockResolvedValue({ items: [], total: 30 });
    state.actors.mockResolvedValue([]);
  });
  it("preserves the exact record in filtering and pagination", async () => {
    const html = renderToStaticMarkup(
      await ActivityPage({
        searchParams: Promise.resolve({
          entityType: "ORDER",
          entityId,
          action: "UPDATED",
          pageSize: "25",
        }),
      }),
    );
    expect(state.events).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "ORDER", entityId }),
    );
    expect(html).toContain(`name="entityId" value="${entityId}"`);
    expect(html).toContain(
      `entityType=ORDER&amp;entityId=${entityId}&amp;action=UPDATED&amp;pageSize=25&amp;page=2`,
    );
    expect(html).toContain("Showing activity for this record only.");
    expect(html).toContain(
      'href="/admin/activity?entityType=ORDER&amp;action=UPDATED&amp;pageSize=25"',
    );
  });
  it.each(["bad?id=other", [entityId, "another-record"]])(
    "rejects malformed or repeated record filters instead of widening the query",
    async (invalidId) => {
      const html = renderToStaticMarkup(
        await ActivityPage({
          searchParams: Promise.resolve({ entityId: invalidId }),
        }),
      );
      expect(html).toContain("The record filter is invalid.");
      expect(state.events).not.toHaveBeenCalled();
      expect(state.actors).not.toHaveBeenCalled();
    },
  );
  it("keeps the existing editor permission requirement before reading events", async () => {
    state.requireEditor.mockRejectedValue(new Error("forbidden"));
    await expect(
      ActivityPage({ searchParams: Promise.resolve({ entityId }) }),
    ).rejects.toThrow("forbidden");
    expect(state.events).not.toHaveBeenCalled();
    expect(state.actors).not.toHaveBeenCalled();
  });
});
