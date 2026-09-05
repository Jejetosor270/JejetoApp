import { z } from "zod";

export const packageInputSchema = z.object({
  projectId: z.uuid(),
  id: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.uuid().optional(),
  ),
  name: z
    .string()
    .trim()
    .min(2)
    .max(200)
    .transform((value) => value.replace(/\s+/g, " ")),
  operation: z.enum(["save", "archive", "restore"]).default("save"),
});
export const packageAssignmentSchema = z.object({
  orderId: z.uuid(),
  projectId: z.uuid(),
  packageId: z.preprocess(
    (value) => (value === "" ? null : value),
    z.uuid().nullable(),
  ),
});
