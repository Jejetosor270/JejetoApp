import { z } from "zod";

export const applicationSettingsSchema = z.object({
  companyName: z.string().trim().min(1).max(160),
});

export type ApplicationSettingsInput = z.infer<
  typeof applicationSettingsSchema
>;
