import { UserRole } from "@/generated/prisma/client";

import { verifyPassword } from "@/domain/users/passwords";
import type { LoginInput } from "@/domain/users/validation";

export interface EmployeeAuthenticationRecord {
  email: string;
  id: string;
  isActive: boolean;
  name: string;
  passwordHash: string | null;
  role: UserRole;
}

export interface EmployeeAuthenticationRepository {
  findByNormalizedEmail(
    email: string,
  ): Promise<EmployeeAuthenticationRecord | null>;
}

/**
 * Returns no user for invalid, inactive, or legacy credential-less employees so
 * the sign-in boundary can always show the same generic authentication failure.
 */
export async function authenticateEmployee(
  input: LoginInput,
  repository: EmployeeAuthenticationRepository,
): Promise<EmployeeAuthenticationRecord | null> {
  const employee = await repository.findByNormalizedEmail(input.email);

  if (!employee?.isActive || !employee.passwordHash) {
    return null;
  }

  const isValidPassword = await verifyPassword(
    input.password,
    employee.passwordHash,
  );

  return isValidPassword ? employee : null;
}
