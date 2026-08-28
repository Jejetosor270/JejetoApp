const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EUROPEAN_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export const BUSINESS_TIME_ZONE = "Europe/Paris";

export function isDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const date = dateOnlyToDate(value);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function dateOnlyToDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function dateToDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addWeeksToDateOnly(value: string, weeks: number): string {
  const date = dateOnlyToDate(value);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return dateToDateOnly(date);
}

export function addMonthsToDateOnly(value: string, months: number): string {
  const [year = "0", month = "1", day = "1"] = value.split("-");
  const sourceYear = Number(year);
  const sourceMonth = Number(month) - 1;
  const sourceDay = Number(day);
  const targetMonth = sourceMonth + months;
  const targetYear = sourceYear + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0),
  ).getUTCDate();
  return dateToDateOnly(
    new Date(
      Date.UTC(targetYear, normalizedMonth, Math.min(sourceDay, lastDay)),
    ),
  );
}

export function formatDateOnly(value: string | null): string {
  if (!value) return "—";
  const [year = "", month = "", day = ""] = value.split("-");
  return isDateOnly(value) ? `${day}/${month}/${year}` : value;
}

export function dateOnlyToEuropeanInput(value: string | null): string {
  return value ? formatDateOnly(value) : "";
}

export function europeanInputToDateOnly(value: string): string | null {
  const normalized = value.trim();
  if (isDateOnly(normalized)) return normalized;
  const match = EUROPEAN_DATE_PATTERN.exec(normalized);
  if (!match) return null;
  const [, day = "", month = "", year = ""] = match;
  const dateOnly = `${year}-${month}-${day}`;
  return isDateOnly(dateOnly) ? dateOnly : null;
}

export function businessToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function monthBounds(month: string): { end: string; start: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new RangeError("Invalid month.");
  const start = `${month}-01`;
  const next = addMonthsToDateOnly(start, 1);
  const endDate = dateOnlyToDate(next);
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  return { end: dateToDateOnly(endDate), start };
}

export function monthGrid(month: string): readonly {
  date: string;
  inMonth: boolean;
}[] {
  const { end, start } = monthBounds(month);
  const first = dateOnlyToDate(start);
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  first.setUTCDate(first.getUTCDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(date.getUTCDate() + index);
    const value = dateToDateOnly(date);
    return { date: value, inMonth: value >= start && value <= end };
  });
}
