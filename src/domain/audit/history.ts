import { z } from "zod";
import { formatDateOnly, isDateOnly } from "@/domain/payments/dates";
import {
  formatDecimal,
  formatMoney,
  formatRate,
} from "@/domain/procurement/presentation";
import { formatEnumLabel } from "@/domain/presentation/labels";

export const recordHistoryTypes = [
  "PROJECT",
  "ORDER",
  "BILLING_DOCUMENT",
] as const;
export type RecordHistoryType = (typeof recordHistoryTypes)[number];
export const recordHistoryScopeSchema = z.object({
  entityType: z.enum(recordHistoryTypes),
  entityId: z.uuid(),
});
// Audit IDs also include fixed non-UUID keys such as the company setting.
export const auditEntityIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);

export interface RecordHistoryEntry {
  id: string;
  occurredAt: string;
  actorName: string;
  action: string;
  summary: string;
  changes: readonly { label: string; before: string; after: string }[];
}
export interface RecordHistoryData {
  entries: readonly RecordHistoryEntry[];
  hasMore: boolean;
  activityHref: string;
}

export function recordActivityHref(
  entityType: RecordHistoryType,
  entityId: string,
) {
  const scope = recordHistoryScopeSchema.parse({ entityType, entityId });
  return `/admin/activity?${new URLSearchParams(scope)}`;
}

type FieldKind = "money" | "rate" | "date" | "text" | "enum" | "boolean";
const fields: Record<string, readonly [string, FieldKind]> = {
  clientBudgetTargetHt: ["Client budget HT", "money"],
  estimatedPurchaseCostHt: ["Product purchase budget HT", "money"],
  estimatedFreightCostHt: ["Freight budget HT", "money"],
  estimatedOtherCostHt: ["Other/services budget HT", "money"],
  expectedSellHt: ["Budgeted sell HT", "money"],
  freightEstimateRate: ["Freight estimate", "rate"],
  defaultProductMarkupRate: ["Product markup", "rate"],
  defaultFreightMarkupRate: ["Freight markup", "rate"],
  defaultOtherCostMarkupRate: ["Other/services markup", "rate"],
  targetMarkupRate: ["Target markup", "rate"],
  targetMode: ["Target method", "enum"],
  reference: ["Reference", "text"],
  orderNumber: ["Reference", "text"],
  shortDescription: ["Short description", "text"],
  documentDate: ["Document date", "date"],
  invoiceDate: ["Invoice date", "date"],
  dueDate: ["Due date", "date"],
  expectedReadyDate: ["Expected ready", "date"],
  expectedDeliveryDate: ["Expected delivery", "date"],
  actualDeliveryDate: ["Delivered on", "date"],
  status: ["Status", "enum"],
  workflowStatus: ["Billing status", "enum"],
  isCancelled: ["Cancelled", "boolean"],
};
const object = z.record(z.string(), z.unknown());

function formattedValue(
  value: unknown,
  kind: FieldKind,
  currency: unknown,
): string | null {
  if (value === null || value === "") return "Not set";
  if (kind === "boolean")
    return typeof value === "boolean" ? (value ? "Yes" : "No") : null;
  if (typeof value !== "string" || value.length > 240) return null;
  if (kind === "text") return value;
  if (kind === "date") return isDateOnly(value) ? formatDateOnly(value) : null;
  if (kind === "enum")
    return /^[A-Z_]+$/.test(value) ? formatEnumLabel(value) : null;
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
  if (kind === "rate") return formatRate(value);
  return typeof currency === "string" && /^[A-Z]{3}$/.test(currency)
    ? formatMoney(value, currency)
    : `${formatDecimal(value)} (currency not recorded)`;
}

/** Never serialize arbitrary audit metadata: only known scalar before/after fields. */
export function recordAuditChanges(
  entityType: string,
  metadata: unknown,
): RecordHistoryEntry["changes"] {
  if (!recordHistoryTypes.some((type) => type === entityType)) return [];
  const parsed = object.safeParse(metadata);
  if (!parsed.success) return [];
  const data = parsed.data;
  const before = object.safeParse(data.before);
  const after = object.safeParse(data.after);
  const candidates =
    before.success && after.success
      ? Object.keys(fields).map((key) => ({
          key,
          before: before.data[key],
          after: after.data[key],
          beforeCurrency: before.data.reportingCurrencyCode,
          afterCurrency: after.data.reportingCurrencyCode,
        }))
      : typeof data.field === "string"
        ? [
            {
              key: data.field,
              before: data.previous,
              after: data.value,
              beforeCurrency: undefined,
              afterCurrency: undefined,
            },
          ]
        : [];
  return candidates.flatMap((change) => {
    const field = Object.hasOwn(fields, change.key)
      ? fields[change.key]
      : undefined;
    if (
      !field ||
      change.before === undefined ||
      change.after === undefined ||
      change.before === change.after
    )
      return [];
    const previous = formattedValue(
      change.before,
      field[1],
      change.beforeCurrency,
    );
    const next = formattedValue(change.after, field[1], change.afterCurrency);
    if (previous === null || next === null) return [];
    const label =
      change.key === "status"
        ? entityType === "PROJECT"
          ? "Project status"
          : entityType === "ORDER"
            ? "Delivery status"
            : "Document status"
        : field[0];
    return [{ label, before: previous, after: next }];
  });
}
