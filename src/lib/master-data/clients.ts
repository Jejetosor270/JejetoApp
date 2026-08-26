import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type {
  CreateClientInput,
  UpdateClientInput,
} from "@/domain/master-data/validation";
import { getDatabase } from "@/lib/db";

import {
  InvalidMasterDataRelationError,
  MasterDataNotFoundError,
} from "./errors";

const clientSelect = {
  _count: { select: { projects: true } },
  billingAddressLine1: true,
  billingAddressLine2: true,
  billingCity: true,
  billingPostalCode: true,
  contactName: true,
  countryCode: true,
  defaultCurrencyCode: true,
  displayName: true,
  email: true,
  id: true,
  isActive: true,
  legalName: true,
  notes: true,
  phone: true,
  vatNumber: true,
} satisfies Prisma.ClientSelect;

export type ManagedClient = Prisma.ClientGetPayload<{
  select: typeof clientSelect;
}>;

function clientData(input: CreateClientInput) {
  return {
    billingAddressLine1: input.billingAddressLine1 ?? null,
    billingAddressLine2: input.billingAddressLine2 ?? null,
    billingCity: input.billingCity ?? null,
    billingPostalCode: input.billingPostalCode ?? null,
    contactName: input.contactName ?? null,
    countryCode: input.countryCode ?? null,
    defaultCurrencyCode: input.defaultCurrencyCode,
    displayName: input.displayName,
    email: input.email ?? null,
    legalName: input.legalName,
    notes: input.notes ?? null,
    phone: input.phone ?? null,
    vatNumber: input.vatNumber ?? null,
  };
}

async function assertActiveCurrency(currencyCode: string): Promise<void> {
  const currency = await getDatabase().currency.findFirst({
    where: { code: currencyCode, isActive: true },
    select: { code: true },
  });
  if (!currency) {
    throw new InvalidMasterDataRelationError(
      "Choose an active default currency.",
    );
  }
}

export async function listClients(
  query: string,
  active: "active" | "inactive" | "all",
) {
  const normalizedQuery = query.trim();
  return getDatabase().client.findMany({
    where: {
      ...(active === "all" ? {} : { isActive: active === "active" }),
      ...(normalizedQuery
        ? {
            OR: [
              {
                displayName: { contains: normalizedQuery, mode: "insensitive" },
              },
              { legalName: { contains: normalizedQuery, mode: "insensitive" } },
              {
                contactName: { contains: normalizedQuery, mode: "insensitive" },
              },
              { vatNumber: { contains: normalizedQuery, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
    select: clientSelect,
  });
}

export async function createClient(
  actorId: string,
  input: CreateClientInput,
): Promise<ManagedClient> {
  await assertActiveCurrency(input.defaultCurrencyCode);
  return getDatabase().client.create({
    data: { ...clientData(input), createdById: actorId, updatedById: actorId },
    select: clientSelect,
  });
}

export async function updateClient(
  actorId: string,
  input: UpdateClientInput,
): Promise<ManagedClient> {
  const { id, isActive, ...fields } = input;
  await assertActiveCurrency(fields.defaultCurrencyCode);
  try {
    return await getDatabase().client.update({
      where: { id },
      data: { ...clientData(fields), isActive, updatedById: actorId },
      select: clientSelect,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new MasterDataNotFoundError("This client no longer exists.");
    }
    throw error;
  }
}
