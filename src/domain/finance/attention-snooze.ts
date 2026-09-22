import { z } from "zod";
import { addDays } from "date-fns";
import {
  dateOnlyToDate,
  dateToDateOnly,
  isDateOnly,
} from "@/domain/payments/dates";

export const attentionSnoozeSchema = z.object({
  key: z
    .string()
    .max(120)
    .regex(/^[a-z0-9-]+:[a-f0-9-]{36}$/),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  horizon: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  until: z.string().refine(isDateOnly, "Choose a valid date."),
  reason: z.string().trim().min(1, "Enter a reason.").max(300),
});
export function validSnoozeDate(until: string, today: string) {
  return (
    isDateOnly(until) &&
    until > today &&
    until <= dateToDateOnly(addDays(dateOnlyToDate(today), 365))
  );
}
export function isAttentionSnoozed(
  issue: { fingerprint: string },
  snooze: { fingerprint: string; until: string } | undefined,
  today: string,
) {
  return (
    !!snooze && snooze.fingerprint === issue.fingerprint && snooze.until > today
  );
}
