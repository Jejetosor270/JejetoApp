import { describe, expect, it } from "vitest";

import {
  addWeeksToDateOnly,
  addMonthsToDateOnly,
  businessToday,
  dateOnlyToDate,
  dateOnlyToEuropeanInput,
  dateToDateOnly,
  europeanInputToDateOnly,
  formatDateOnly,
  formatTimestamp,
  formatTimestampDate,
  isDateOnly,
  monthBounds,
  monthGrid,
} from "@/domain/payments/dates";

describe("date-only payment helpers", () => {
  it("round-trips business dates without timezone shifts", () => {
    expect(dateToDateOnly(dateOnlyToDate("2026-09-15"))).toBe("2026-09-15");
    expect(formatDateOnly("2026-09-15")).toBe("15/09/2026");
    expect(dateOnlyToEuropeanInput("2026-08-29")).toBe("29/08/2026");
  });

  it("formats timestamps as DD/MM/YYYY", () => {
    expect(formatTimestampDate("2026-09-04T21:15:00.000Z")).toBe("04/09/2026");
    expect(formatTimestampDate(null)).toBe("—");
  });

  it("formats audit timestamps with a separate time", () => {
    expect(formatTimestamp("2026-09-04T15:07:00.000Z")).toBe(
      "04/09/2026, 17:07",
    );
  });

  it("parses European input without reversing day and month", () => {
    expect(europeanInputToDateOnly("05/09/2026")).toBe("2026-09-05");
    expect(europeanInputToDateOnly("29/08/2026")).toBe("2026-08-29");
    expect(europeanInputToDateOnly("08/29/2026")).toBeNull();
    expect(europeanInputToDateOnly("31/02/2026")).toBeNull();
    expect(europeanInputToDateOnly("2026-09-05")).toBe("2026-09-05");
  });

  it("adds lead-time weeks in UTC date space", () => {
    expect(addWeeksToDateOnly("2026-08-31", 6)).toBe("2026-10-12");
  });

  it("adds preset months without overflowing month-end", () => {
    expect(addMonthsToDateOnly("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("validates real calendar dates", () => {
    expect(isDateOnly("2026-02-28")).toBe(true);
    expect(isDateOnly("2026-02-30")).toBe(false);
  });

  it("uses the Paris business day around a UTC boundary", () => {
    expect(businessToday(new Date("2026-08-22T22:30:00.000Z"))).toBe(
      "2026-08-23",
    );
  });

  it("builds stable month boundaries and a Monday-first grid", () => {
    expect(monthBounds("2026-09")).toEqual({
      end: "2026-09-30",
      start: "2026-09-01",
    });
    expect(monthGrid("2026-09")[0]?.date).toBe("2026-08-31");
  });
});
