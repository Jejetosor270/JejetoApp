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

export class ProjectReportingCurrencyLockedError extends Error {
  constructor() {
    super(
      "Reporting currency cannot be changed after a Project has Supplier Orders because historical FX rates and reporting values depend on it.",
    );
    this.name = "ProjectReportingCurrencyLockedError";
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
): error is
  | MasterDataNotFoundError
  | InvalidMasterDataRelationError
  | ProjectReportingCurrencyLockedError {
  return (
    error instanceof MasterDataNotFoundError ||
    error instanceof InvalidMasterDataRelationError ||
    error instanceof ProjectReportingCurrencyLockedError
  );
}
