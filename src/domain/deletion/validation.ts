import { z } from "zod";

export const selectedIdsSchema = z
  .array(z.uuid())
  .min(1, "Select at least one record.")
  .max(100, "Select no more than 100 records at a time.")
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "The selection contains duplicate records.",
  });

export function selectedIds(formData: FormData): unknown[] {
  return formData.getAll("selectedIds");
}
