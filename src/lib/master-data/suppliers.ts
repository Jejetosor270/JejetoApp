import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type {
  CreateSupplierInput,
  UpdateSupplierInput,
} from "@/domain/master-data/validation";
import { getDatabase } from "@/lib/db";

import {
  InvalidMasterDataRelationError,
  MasterDataNotFoundError,
} from "./errors";

const supplierSelect = {
  addressLine1: true,
  addressLine2: true,
  city: true,
  contactName: true,
  countryCode: true,
  defaultCurrencyCode: true,
  defaultLeadTimeWeeks: true,
  defaultPaymentTermsDays: true,
  defaultPaymentTermsNotes: true,
  displayName: true,
  email: true,
  id: true,
  isActive: true,
  legalName: true,
  notes: true,
  phone: true,
  postalCode: true,
  vatNumber: true,
} satisfies Prisma.SupplierSelect;

export type ManagedSupplier = Prisma.SupplierGetPayload<{
  select: typeof supplierSelect;
}>;

function supplierData(input: CreateSupplierInput) {
  return {
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    city: input.city ?? null,
    contactName: input.contactName ?? null,
    countryCode: input.countryCode ?? null,
    defaultCurrencyCode: input.defaultCurrencyCode,
    defaultLeadTimeWeeks: input.defaultLeadTimeWeeks ?? null,
    defaultPaymentTermsDays: input.defaultPaymentTermsDays ?? null,
    defaultPaymentTermsNotes: input.defaultPaymentTermsNotes ?? null,
    displayName: input.displayName,
    email: input.email ?? null,
    legalName: input.legalName,
    notes: input.notes ?? null,
    phone: input.phone ?? null,
    postalCode: input.postalCode ?? null,
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

export async function listSuppliers(
  query: string,
  active: "active" | "inactive" | "all",
) {
  const normalizedQuery = query.trim();
  return getDatabase().supplier.findMany({
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
    select: supplierSelect,
  });
}

export async function createSupplier(
  actorId: string,
  input: CreateSupplierInput,
): Promise<ManagedSupplier> {
  await assertActiveCurrency(input.defaultCurrencyCode);
  return getDatabase().supplier.create({
    data: {
      ...supplierData(input),
      createdById: actorId,
      updatedById: actorId,
    },
    select: supplierSelect,
  });
}

export async function updateSupplier(
  actorId: string,
  input: UpdateSupplierInput,
): Promise<ManagedSupplier> {
  const { id, isActive, ...fields } = input;
  await assertActiveCurrency(fields.defaultCurrencyCode);
  try {
    return await getDatabase().supplier.update({
      where: { id },
      data: { ...supplierData(fields), isActive, updatedById: actorId },
      select: supplierSelect,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new MasterDataNotFoundError("This supplier no longer exists.");
    }
    throw error;
  }
}
