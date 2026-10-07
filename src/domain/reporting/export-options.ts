import { z } from "zod";
import { ProjectStatus } from "@/generated/prisma/client";
import { isDateOnly } from "@/domain/payments/dates";

export const reportExports = [
  { value: "summary", label: "Dashboard summary" },
  { value: "trend", label: "Monthly actual cash" },
  { value: "forecast", label: "Cash forecast" },
  { value: "obligations", label: "Forecast source records" },
  { value: "projects", label: "Project comparisons" },
  { value: "transactions", label: "Cash transactions" },
  { value: "vat", label: "VAT position" },
  { value: "freight", label: "Freight coverage" },
] as const;
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional(),
  );
export const reportExportSchema = z
  .object({
    dataset: z.enum([
      "summary",
      "trend",
      "forecast",
      "obligations",
      "projects",
      "transactions",
      "vat",
      "freight",
    ]),
    projectId: optional(z.uuid()),
    clientId: optional(z.uuid()),
    supplierId: optional(z.uuid()),
    projectStatus: optional(z.enum(ProjectStatus)),
    horizon: z.enum(["30d", "90d", "6m", "12m"]).default("90d"),
    trendMonths: z.enum(["3", "6", "12"]).default("6"),
    cashDelay: z.enum(["0", "15", "30", "60"]).default("0"),
    direction: optional(z.enum(["SUPPLIER_PAYMENT", "CLIENT_RECEIPT"])),
    dateFrom: optional(z.string().refine(isDateOnly)),
    dateTo: optional(z.string().refine(isDateOnly)),
  })
  .superRefine((value, ctx) => {
    if (
      ["summary", "trend", "forecast", "obligations"].includes(value.dataset) &&
      Boolean(value.dateFrom) !== Boolean(value.dateTo)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Choose both dates for a period report.",
        path: ["dateFrom"],
      });
    }
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
      ctx.addIssue({
        code: "custom",
        message: "Choose a valid date range.",
        path: ["dateFrom"],
      });
    }
    if (
      value.dateFrom &&
      value.dateTo &&
      new Date(value.dateTo).getTime() - new Date(value.dateFrom).getTime() >
        731 * 86400000
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Export at most two years at a time.",
        path: ["dateTo"],
      });
    }
  });
export type ReportExportOptions = z.infer<typeof reportExportSchema>;
