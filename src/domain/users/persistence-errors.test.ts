import { Prisma } from "@/generated/prisma/client";
import { describe, expect, it } from "vitest";

import { isDuplicateEmailError } from "@/domain/users/persistence-errors";

describe("employee email conflicts", () => {
  it("recognizes the unique-email violation returned by Prisma", () => {
    const duplicateEmailError = new Prisma.PrismaClientKnownRequestError(
      "Duplicate employee email",
      {
        clientVersion: "test",
        code: "P2002",
      },
    );

    expect(isDuplicateEmailError(duplicateEmailError)).toBe(true);
  });
});
