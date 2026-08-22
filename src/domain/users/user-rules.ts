import { UserRole } from "@/generated/prisma/client";

export interface ActiveAdminCandidate {
  isActive: boolean;
  role: UserRole;
}

export class FinalActiveAdminError extends Error {
  constructor() {
    super("At least one active administrator must remain.");
    this.name = "FinalActiveAdminError";
  }
}

export function assertActiveAdminRetained({
  currentUser,
  activeAdminCount,
  nextIsActive,
  nextRole,
}: {
  activeAdminCount: number;
  currentUser: ActiveAdminCandidate;
  nextIsActive: boolean;
  nextRole: UserRole;
}): void {
  const removesActiveAdmin =
    currentUser.isActive &&
    currentUser.role === UserRole.ADMIN &&
    (!nextIsActive || nextRole !== UserRole.ADMIN);

  if (removesActiveAdmin && activeAdminCount <= 1) {
    throw new FinalActiveAdminError();
  }
}
