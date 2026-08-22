import { truncates } from "bcryptjs";
import { z } from "zod";

import { UserRole } from "@/generated/prisma/client";

export const minimumPasswordLength = 12;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(320, "Email must be 320 characters or fewer.")
  .pipe(z.email("Enter a valid email address."));

export const employeeNameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters.")
  .max(160, "Name must be 160 characters or fewer.");

export const passwordSchema = z
  .string()
  .min(
    minimumPasswordLength,
    `Password must be at least ${minimumPasswordLength} characters.`,
  )
  .refine(
    (password) => !truncates(password),
    "Password is too long. Use 72 bytes or fewer.",
  );

export const loginInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const createEmployeeInputSchema = z.object({
  name: employeeNameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(UserRole),
});

export const updateEmployeeInputSchema = z.object({
  id: z.uuid("Invalid user."),
  name: employeeNameSchema,
  email: emailSchema,
  isActive: z.boolean(),
  role: z.enum(UserRole),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeInputSchema>;
