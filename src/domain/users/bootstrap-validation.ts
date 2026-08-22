import { z } from "zod";

import { passwordSchema } from "@/domain/users/validation";

export const bootstrapAdminInputSchema = z.object({
  BOOTSTRAP_ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
  BOOTSTRAP_ADMIN_NAME: z.string().trim().min(2).max(160),
  BOOTSTRAP_ADMIN_PASSWORD: passwordSchema,
});
