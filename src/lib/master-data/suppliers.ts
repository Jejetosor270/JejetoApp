import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type {
  CreateSupplierInput,
  UpdateSupplierInput,
} from "@/domain/master-data/validation";
import { getDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit/events";
import { paginationSkip, type PageInput } from "@/domain/listing/validation";

import {
  InvalidMasterDataRelationError,
  MasterDataNotFoundError,
} from "./errors";

const supplierSelect = {
  _count: { select: { orders: true } },
  addressLine1: true,
  addressLine2: true,
  city: true,
  contactName: true,
  countryCode: true,
  createdAt: true,
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
  updatedAt: true,
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

export interface SupplierListFilters extends PageInput {
  active: "active" | "inactive" | "all";
  countryCode?: string | undefined;
  currencyCode?: string | undefined;
  direction: "asc" | "desc";
  query: string;
  sort: "created" | "name" | "updated";
}

function supplierWhere(
  filters: SupplierListFilters,
): Prisma.SupplierWhereInput {
  const normalizedQuery = filters.query.trim();
  return {
    ...(filters.active === "all"
      ? {}
      : { isActive: filters.active === "active" }),
    ...(filters.countryCode ? { countryCode: filters.countryCode } : {}),
    ...(filters.currencyCode
      ? { defaultCurrencyCode: filters.currencyCode }
      : {}),
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
  };
}

export async function listSuppliers(filters: SupplierListFilters) {
  const where = supplierWhere(filters);
  const orderBy: Prisma.SupplierOrderByWithRelationInput[] =
    filters.sort === "created"
      ? [{ createdAt: filters.direction }, { id: "asc" }]
      : filters.sort === "updated"
        ? [{ updatedAt: filters.direction }, { id: "asc" }]
        : [{ displayName: filters.direction }, { id: "asc" }];
  const database = getDatabase();
  const [items, total] = await Promise.all([
    database.supplier.findMany({
      orderBy,
      select: supplierSelect,
      skip: paginationSkip(filters),
      take: filters.pageSize,
      where,
    }),
    database.supplier.count({ where }),
  ]);
  return { items, total };
}

export async function getSupplier(id: string): Promise<ManagedSupplier | null> {
  return getDatabase().supplier.findUnique({
    where: { id },
    select: supplierSelect,
  });
}

export async function createSupplier(
  actorId: string,
  input: CreateSupplierInput,
): Promise<ManagedSupplier> {
  await assertActiveCurrency(input.defaultCurrencyCode);
  return getDatabase().$transaction(async (transaction) => {
    const supplier = await transaction.supplier.create({
      data: {
        ...supplierData(input),
        createdById: actorId,
        updatedById: actorId,
      },
      select: supplierSelect,
    });
    await writeAuditEvent(transaction, actorId, {
      action: "CREATED",
      entityId: supplier.id,
      entityReference: supplier.displayName,
      entityType: "SUPPLIER",
      summary: "Created the Supplier.",
    });
    return supplier;
  });
}

export async function updateSupplier(
  actorId: string,
  input: UpdateSupplierInput,
): Promise<ManagedSupplier> {
  const { id, isActive, ...fields } = input;
  await assertActiveCurrency(fields.defaultCurrencyCode);
  try {
    return await getDatabase().$transaction(async (transaction) => {
      const supplier = await transaction.supplier.update({
        where: { id },
        data: { ...supplierData(fields), isActive, updatedById: actorId },
        select: supplierSelect,
      });
      await writeAuditEvent(transaction, actorId, {
        action: "UPDATED",
        entityId: supplier.id,
        entityReference: supplier.displayName,
        entityType: "SUPPLIER",
        metadata: { active: supplier.isActive },
        summary: "Updated the Supplier.",
      });
      return supplier;
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
