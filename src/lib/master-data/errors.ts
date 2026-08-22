import { Prisma } from "@/generated/prisma/client";

export class MasterDataNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MasterDataNotFoundError";
  }
}

export class InvalidMasterDataRelationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMasterDataRelationError";
  }
}

export function isDuplicateMasterDataError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export function isExpectedMasterDataError(
  error: unknown,
): error is MasterDataNotFoundError | InvalidMasterDataRelationError {
  return (
    error instanceof MasterDataNotFoundError ||
    error instanceof InvalidMasterDataRelationError
  );
}
