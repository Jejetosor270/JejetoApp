import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";
import { z } from "zod";

import { bootstrapAdminInputSchema } from "../src/domain/users/bootstrap-validation";
import { PrismaClient, UserRole } from "../src/generated/prisma/client";

const bootstrapEnvironmentSchema = bootstrapAdminInputSchema.extend({
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
});

async function bootstrapAdmin(): Promise<void> {
  const environment = bootstrapEnvironmentSchema.parse(process.env);
  const databaseUrl = environment.DIRECT_URL ?? environment.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "Set DIRECT_URL or DATABASE_URL before bootstrapping an administrator.",
    );
  }

  const database = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    const activeAdministrator = await database.user.findFirst({
      where: { isActive: true, role: UserRole.ADMIN },
      select: { id: true },
    });

    if (activeAdministrator) {
      throw new Error(
        "An active administrator already exists. Use the employee management screen instead.",
      );
    }

    const passwordHash = await hash(environment.BOOTSTRAP_ADMIN_PASSWORD, 12);
    const administrator = await database.user.create({
      data: {
        email: environment.BOOTSTRAP_ADMIN_EMAIL,
        isActive: true,
        name: environment.BOOTSTRAP_ADMIN_NAME,
        passwordHash,
        role: UserRole.ADMIN,
      },
      select: { email: true, id: true },
    });

    console.log(
      `Created initial administrator ${administrator.email} (${administrator.id}).`,
    );
  } finally {
    await database.$disconnect();
  }
}

bootstrapAdmin().catch((error: unknown) => {
  console.error("Could not bootstrap the initial administrator.", error);
  process.exitCode = 1;
});
