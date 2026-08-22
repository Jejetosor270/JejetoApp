import "server-only";

import { UserRole } from "@/generated/prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { getDatabase } from "@/lib/db";
import { getAuthenticationEnvironment } from "@/lib/env/auth";
import {
  assertRequiredRole,
  InsufficientRoleError,
} from "@/domain/users/authorization";

export interface AuthenticatedUser {
  email: string;
  id: string;
  isActive: true;
  name: string;
  role: UserRole;
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  getAuthenticationEnvironment();
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  const user = await getDatabase().user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      id: true,
      isActive: true,
      name: true,
      role: true,
    },
  });

  if (!user?.isActive) {
    return null;
  }

  return { ...user, isActive: true };
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireRole(
  allowedRoles: readonly UserRole[],
): Promise<AuthenticatedUser> {
  const user = await requireUser();

  try {
    assertRequiredRole(user.role, allowedRoles);
  } catch (error) {
    if (error instanceof InsufficientRoleError) {
      redirect("/");
    }

    throw error;
  }

  return user;
}

export async function requireAdmin(): Promise<AuthenticatedUser> {
  return requireRole([UserRole.ADMIN]);
}
