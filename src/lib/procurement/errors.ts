import { Prisma } from "@/generated/prisma/client";

export class ProcurementRelationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProcurementRelationError";
  }
}

export class ProcurementNotFoundError extends Error {
  constructor() {
    super("This procurement order no longer exists.");
    this.name = "ProcurementNotFoundError";
  }
}

export function isDuplicateOrderReferenceError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export function isExpectedProcurementError(
  error: unknown,
): error is ProcurementRelationError | ProcurementNotFoundError | RangeError {
  return (
    error instanceof ProcurementRelationError ||
    error instanceof ProcurementNotFoundError ||
    error instanceof RangeError
  );
}
