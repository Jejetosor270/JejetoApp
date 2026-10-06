import { z } from "zod";
import { isDateOnly } from "@/domain/payments/dates";

export const ASSISTANT_LIST_PAGE_SIZE = 25;
export const ASSISTANT_DERIVED_SCOPE_LIMIT = 500;
export const assistantListKinds = [
  "Project",
  "Order",
  "Billing",
  "Client",
  "Supplier",
] as const;
export const assistantFilterNames = [
  "query",
  "project",
  "supplier",
  "client",
  "status",
  "paymentStatus",
  "documentType",
  "dates",
  "active",
] as const;

const name = z.string().trim().min(2).max(100).nullable();
const date = z.string().refine(isDateOnly, "Use a valid date.").nullable();
const id = z.uuid().nullable();
export const assistantPlanFiltersSchema = z.strictObject({
  project: name,
  supplier: name,
  client: name,
  status: z.string().trim().min(1).max(40).nullable(),
  paymentStatus: z
    .enum(["UNPAID", "PARTIALLY_PAID", "PAID", "OVERDUE"])
    .nullable(),
  documentType: z.enum(["INVOICE", "QUOTE"]).nullable(),
  dateFrom: date,
  dateTo: date,
  dateField: z.enum(["orderDate", "documentDate", "dueDate"]).nullable(),
  active: z.enum(["active", "inactive", "all"]).nullable(),
});

export const emptyAssistantFilters = {
  project: null,
  supplier: null,
  client: null,
  status: null,
  paymentStatus: null,
  documentType: null,
  dateFrom: null,
  dateTo: null,
  dateField: null,
  active: null,
} as const;

export const assistantListQuerySchema = assistantPlanFiltersSchema
  .extend({
    kind: z.enum(assistantListKinds),
    query: z.string().trim().max(100),
    projectId: id,
    supplierId: id,
    clientId: id,
  })
  .refine(
    (input) =>
      !input.dateFrom || !input.dateTo || input.dateFrom <= input.dateTo,
    {
      path: ["dateTo"],
      message: "End date must follow start date.",
    },
  );

export const assistantListPageSchema = z.strictObject({
  query: assistantListQuerySchema,
  page: z.number().int().min(1).max(10_000),
});
export const assistantPageContextSchema = z.strictObject({
  kind: z.enum(assistantListKinds),
  id: z.uuid(),
});

export type AssistantListQuery = z.infer<typeof assistantListQuerySchema>;
export type AssistantListPage = z.infer<typeof assistantListPageSchema>;
export type AssistantPageContext = z.infer<typeof assistantPageContextSchema>;
export type AssistantPlanFilters = z.infer<typeof assistantPlanFiltersSchema>;
export type AssistantRelationField = "projectId" | "supplierId" | "clientId";

export interface AssistantChoice {
  field: AssistantRelationField;
  id: string;
  label: string;
  context: string;
}

export interface AssistantListing {
  query: AssistantListQuery;
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
  hasPrevious: boolean;
  filters: string[];
}

/** Only recognized record paths become context; URL query strings never grant scope. */
export function assistantContextFromPath(
  path: string,
): AssistantPageContext | null {
  const match =
    /^\/(projects|orders|billing|clients|suppliers)\/([^/]+)\/?$/.exec(path);
  if (!match) return null;
  const kinds: Record<string, AssistantPageContext["kind"]> = {
    projects: "Project",
    orders: "Order",
    billing: "Billing",
    clients: "Client",
    suppliers: "Supplier",
  };
  const parsed = assistantPageContextSchema.safeParse({
    kind: kinds[match[1] ?? ""],
    id: match[2],
  });
  return parsed.success ? parsed.data : null;
}
