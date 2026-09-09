import { z } from "zod";
import { formatEnumLabel } from "@/domain/presentation/labels";

export const manualPaymentStatuses = [
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
] as const;
export const recordStatusSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["order", "billing"]),
  value: z.enum(["AUTO", ...manualPaymentStatuses, "CANCEL"]),
});
export function recordPaymentStatusLabel(
  automatic: string,
  override?: string | null,
  cancelled = false,
) {
  if (cancelled) return "Cancelled";
  if (override) return `${formatEnumLabel(override)} (manual)`;
  return ["NOT_SCHEDULED", "SCHEDULED", "UPCOMING", "INVOICED"].includes(
    automatic,
  )
    ? "Unpaid"
    : formatEnumLabel(automatic);
}
