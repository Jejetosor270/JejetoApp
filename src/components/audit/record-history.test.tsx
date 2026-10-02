import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecordHistory } from "./record-history";

describe("record activity presentation", () => {
  it("renders only this record's safe history and a correctly scoped link", () => {
    const html = renderToStaticMarkup(
      <RecordHistory
        history={{
          activityHref: "/admin/activity?entityType=ORDER&entityId=record",
          hasMore: true,
          entries: [
            {
              id: "one",
              occurredAt: "2026-10-01T12:00:00Z",
              actorName: "Employee",
              action: "UPDATED",
              summary: "Updated record <script>",
              changes: [
                {
                  label: "Due date",
                  before: "01/10/2026",
                  after: "15/10/2026",
                },
              ],
            },
          ],
        }}
      />,
    );
    expect(html).toContain("Employee");
    expect(html).toContain("Changed values (1)");
    expect(html).toContain("01/10/2026");
    expect(html).toContain("View all activity");
    expect(html).toContain("entityId=record");
    expect(html).not.toContain("<script>");
  });
  it("has an explicit empty state and hides entirely without authorized data", () => {
    expect(renderToStaticMarkup(<RecordHistory history={null} />)).toBe("");
    const html = renderToStaticMarkup(
      <RecordHistory
        history={{
          entries: [],
          hasMore: false,
          activityHref: "/admin/activity?entityId=record",
        }}
      />,
    );
    expect(html).toContain("No recorded activity for this record yet.");
  });
});
