import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import {
  FinancialState,
  FreightTreatment,
  PaymentStatus,
  PrismaClient,
  ProcurementCostCategory,
  ProcurementOrderStatus,
  ProjectStatus,
  UserRole,
  VatDirection,
  VatTreatment,
} from "../src/generated/prisma/client";

const ids = {
  admin: "10000000-0000-4000-8000-000000000001",
  client: "20000000-0000-4000-8000-000000000001",
  supplier: "30000000-0000-4000-8000-000000000001",
  project: "40000000-0000-4000-8000-000000000001",
  villa1: "50000000-0000-4000-8000-000000000001",
  villa2: "50000000-0000-4000-8000-000000000002",
  villa3: "50000000-0000-4000-8000-000000000003",
  order: "60000000-0000-4000-8000-000000000001",
  financials: "70000000-0000-4000-8000-000000000001",
  purchaseCost: "71000000-0000-4000-8000-000000000001",
  discountCost: "71000000-0000-4000-8000-000000000002",
  freightCost: "71000000-0000-4000-8000-000000000003",
  inputVat: "72000000-0000-4000-8000-000000000001",
  outputVat: "72000000-0000-4000-8000-000000000002",
  supplierInstallment1: "80000000-0000-4000-8000-000000000001",
  supplierInstallment2: "80000000-0000-4000-8000-000000000002",
  supplierInstallment3: "80000000-0000-4000-8000-000000000003",
  supplierPayment1: "81000000-0000-4000-8000-000000000001",
  clientInstallment1: "90000000-0000-4000-8000-000000000001",
  clientInstallment2: "90000000-0000-4000-8000-000000000002",
  clientReceipt1: "91000000-0000-4000-8000-000000000001",
} as const;

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "Set DIRECT_URL or DATABASE_URL before running the seed command.",
  );
}

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "The representative development seed is disabled in production.",
  );
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function seedCurrencies(): Promise<void> {
  const currencies = [
    { code: "EUR", name: "Euro", minorUnits: 2 },
    { code: "USD", name: "US Dollar", minorUnits: 2 },
    { code: "GBP", name: "Pound Sterling", minorUnits: 2 },
    { code: "CHF", name: "Swiss Franc", minorUnits: 2 },
  ];

  await Promise.all(
    currencies.map((currency) =>
      prisma.currency.upsert({
        where: { code: currency.code },
        update: currency,
        create: currency,
      }),
    ),
  );
}

async function seedRepresentativeProject(): Promise<void> {
  const admin = await prisma.user.upsert({
    where: { id: ids.admin },
    update: {
      email: "admin@mb-interiors.example.invalid",
      isActive: true,
      name: "Development Administrator",
      role: UserRole.ADMIN,
    },
    create: {
      id: ids.admin,
      email: "admin@mb-interiors.example.invalid",
      isActive: true,
      name: "Development Administrator",
      role: UserRole.ADMIN,
    },
  });

  await prisma.client.upsert({
    where: { id: ids.client },
    update: {
      displayName: "Eligo Bled (fictional)",
      legalName: "Eligo Bled Development d.o.o. (fictional)",
    },
    create: {
      id: ids.client,
      legalName: "Eligo Bled Development d.o.o. (fictional)",
      displayName: "Eligo Bled (fictional)",
      countryCode: "SI",
      defaultCurrencyCode: "EUR",
      isActive: true,
      notes: "Representative development data only.",
      createdById: admin.id,
      updatedById: admin.id,
    },
  });

  await prisma.supplier.upsert({
    where: { id: ids.supplier },
    update: {
      displayName: "Nord Atelier Furnishings (fictional)",
      legalName: "Nord Atelier Furnishings S.r.l. (fictional)",
    },
    create: {
      id: ids.supplier,
      legalName: "Nord Atelier Furnishings S.r.l. (fictional)",
      displayName: "Nord Atelier Furnishings (fictional)",
      countryCode: "IT",
      defaultCurrencyCode: "EUR",
      defaultLeadTimeWeeks: 14,
      defaultPaymentTermsDays: 30,
      isActive: true,
      notes: "Representative development data only.",
      createdById: admin.id,
      updatedById: admin.id,
    },
  });

  await prisma.project.upsert({
    where: { id: ids.project },
    update: { name: "Bled Hill Villas", status: ProjectStatus.ACTIVE },
    create: {
      id: ids.project,
      clientId: ids.client,
      code: "BHV-001",
      countryCode: "SI",
      expectedCompletionDate: new Date("2027-06-30T00:00:00.000Z"),
      name: "Bled Hill Villas",
      projectManagerId: admin.id,
      reportingCurrencyCode: "EUR",
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      status: ProjectStatus.ACTIVE,
      notes: "Representative development project.",
      createdById: admin.id,
      updatedById: admin.id,
    },
  });

  const buildings = [
    { id: ids.villa1, name: "Villa 1", shortCode: "V1" },
    { id: ids.villa2, name: "Villa 2", shortCode: "V2" },
    { id: ids.villa3, name: "Villa 3", shortCode: "V3" },
  ];

  await Promise.all(
    buildings.map((building) =>
      prisma.building.upsert({
        where: { id: building.id },
        update: { name: building.name, shortCode: building.shortCode },
        create: {
          ...building,
          projectId: ids.project,
          createdById: admin.id,
          updatedById: admin.id,
        },
      }),
    ),
  );

  await prisma.procurementOrder.upsert({
    where: { id: ids.order },
    update: {
      packageName: "Loose Furniture Package",
      status: ProcurementOrderStatus.ORDERED,
    },
    create: {
      id: ids.order,
      orderNumber: "BHV-001-PO-001",
      packageName: "Loose Furniture Package",
      projectId: ids.project,
      supplierId: ids.supplier,
      orderCurrencyCode: "EUR",
      status: ProcurementOrderStatus.ORDERED,
      freightTreatment: FreightTreatment.INCLUDED_IN_PACKAGE_PRICE,
      orderDate: new Date("2026-08-03T00:00:00.000Z"),
      leadTimeWeeks: 14,
      estimatedDeliveryAt: new Date("2026-11-16T00:00:00.000Z"),
      createdById: admin.id,
      updatedById: admin.id,
    },
  });

  await Promise.all(
    [ids.villa1, ids.villa2].map((buildingId) =>
      prisma.procurementOrderBuilding.upsert({
        where: { orderId_buildingId: { orderId: ids.order, buildingId } },
        update: {},
        create: {
          orderId: ids.order,
          buildingId,
          createdById: admin.id,
        },
      }),
    ),
  );

  await prisma.procurementOrderFinancials.upsert({
    where: { id: ids.financials },
    update: { targetMarginRate: "0.300000" },
    create: {
      id: ids.financials,
      orderId: ids.order,
      state: FinancialState.COMMITTED,
      targetMarginRate: "0.300000",
      sellingPriceOriginalAmount: "90000.0000",
      sellingPriceOriginalCurrencyCode: "EUR",
      sellingPriceFxRate: "1.0000000000",
      sellingPriceReportingAmount: "90000.0000",
      sellingPriceReportingCurrencyCode: "EUR",
      createdById: admin.id,
      updatedById: admin.id,
    },
  });

  const costLines = [
    {
      id: ids.purchaseCost,
      category: ProcurementCostCategory.SUPPLIER_PURCHASE,
      description: "Accepted supplier package",
      originalAmount: "60000.0000",
    },
    {
      id: ids.discountCost,
      category: ProcurementCostCategory.SUPPLIER_DISCOUNT,
      description: "Commercial supplier discount",
      originalAmount: "3000.0000",
    },
    {
      id: ids.freightCost,
      category: ProcurementCostCategory.FREIGHT,
      description: "Forecast inbound freight",
      originalAmount: "5000.0000",
    },
  ];

  await Promise.all(
    costLines.map((line) =>
      prisma.procurementOrderCostLine.upsert({
        where: { id: line.id },
        update: {
          category: line.category,
          description: line.description,
          originalAmount: line.originalAmount,
          reportingAmount: line.originalAmount,
        },
        create: {
          ...line,
          financialsId: ids.financials,
          originalCurrencyCode: "EUR",
          fxRateToReporting: "1.0000000000",
          reportingAmount: line.originalAmount,
          reportingCurrencyCode: "EUR",
          createdById: admin.id,
          updatedById: admin.id,
        },
      }),
    ),
  );

  await prisma.procurementOrderVatEntry.upsert({
    where: { id: ids.inputVat },
    update: { treatment: VatTreatment.INTRA_EU_ACQUISITION },
    create: {
      id: ids.inputVat,
      financialsId: ids.financials,
      direction: VatDirection.INPUT,
      treatment: VatTreatment.INTRA_EU_ACQUISITION,
      countryCode: "IT",
      taxableBaseAmount: "57000.0000",
      vatRate: "0.000000",
      vatAmount: "0.0000",
      originalCurrencyCode: "EUR",
      fxRateToReporting: "1.0000000000",
      reportingTaxableBase: "57000.0000",
      reportingVatAmount: "0.0000",
      reportingCurrencyCode: "EUR",
      createdById: admin.id,
      updatedById: admin.id,
    },
  });

  await prisma.procurementOrderVatEntry.upsert({
    where: { id: ids.outputVat },
    update: { treatment: VatTreatment.INTRA_EU_SUPPLY },
    create: {
      id: ids.outputVat,
      financialsId: ids.financials,
      direction: VatDirection.OUTPUT,
      treatment: VatTreatment.INTRA_EU_SUPPLY,
      countryCode: "SI",
      taxableBaseAmount: "90000.0000",
      vatRate: "0.000000",
      vatAmount: "0.0000",
      originalCurrencyCode: "EUR",
      fxRateToReporting: "1.0000000000",
      reportingTaxableBase: "90000.0000",
      reportingVatAmount: "0.0000",
      reportingCurrencyCode: "EUR",
      createdById: admin.id,
      updatedById: admin.id,
    },
  });

  const supplierInstallments = [
    {
      id: ids.supplierInstallment1,
      sequence: 1,
      description: "Deposit",
      percentageRate: "0.300000",
      expectedAmount: "17100.0000",
      expectedDueDate: new Date("2026-08-10T00:00:00.000Z"),
      status: PaymentStatus.PAID,
    },
    {
      id: ids.supplierInstallment2,
      sequence: 2,
      description: "Before dispatch",
      percentageRate: "0.600000",
      expectedAmount: "34200.0000",
      expectedDueDate: new Date("2026-10-30T00:00:00.000Z"),
      status: PaymentStatus.UPCOMING,
    },
    {
      id: ids.supplierInstallment3,
      sequence: 3,
      description: "After installation",
      percentageRate: "0.100000",
      expectedAmount: "5700.0000",
      expectedDueDate: new Date("2026-12-15T00:00:00.000Z"),
      status: PaymentStatus.UPCOMING,
    },
  ];

  await Promise.all(
    supplierInstallments.map((installment) =>
      prisma.supplierPaymentInstallment.upsert({
        where: { id: installment.id },
        update: { status: installment.status },
        create: {
          ...installment,
          orderId: ids.order,
          currencyCode: "EUR",
          expectedFxRate: "1.0000000000",
          expectedReportingAmount: installment.expectedAmount,
          reportingCurrencyCode: "EUR",
          createdById: admin.id,
          updatedById: admin.id,
        },
      }),
    ),
  );

  await prisma.supplierPayment.upsert({
    where: { id: ids.supplierPayment1 },
    update: { paymentReference: "DEV-SUP-001" },
    create: {
      id: ids.supplierPayment1,
      installmentId: ids.supplierInstallment1,
      amount: "17100.0000",
      currencyCode: "EUR",
      paidAt: new Date("2026-08-10T00:00:00.000Z"),
      fxRateToReporting: "1.0000000000",
      reportingAmount: "17100.0000",
      reportingCurrencyCode: "EUR",
      paymentReference: "DEV-SUP-001",
      createdById: admin.id,
      updatedById: admin.id,
    },
  });

  const clientInstallments = [
    {
      id: ids.clientInstallment1,
      sequence: 1,
      description: "Project procurement deposit",
      percentageRate: "0.500000",
      expectedAmount: "45000.0000",
      expectedDate: new Date("2026-07-15T00:00:00.000Z"),
      status: PaymentStatus.PAID,
    },
    {
      id: ids.clientInstallment2,
      sequence: 2,
      description: "Pre-delivery balance",
      percentageRate: "0.500000",
      expectedAmount: "45000.0000",
      expectedDate: new Date("2026-11-02T00:00:00.000Z"),
      status: PaymentStatus.UPCOMING,
    },
  ];

  await Promise.all(
    clientInstallments.map((installment) =>
      prisma.clientPaymentInstallment.upsert({
        where: { id: installment.id },
        update: { status: installment.status },
        create: {
          ...installment,
          projectId: ids.project,
          currencyCode: "EUR",
          expectedFxRate: "1.0000000000",
          expectedReportingAmount: installment.expectedAmount,
          reportingCurrencyCode: "EUR",
          createdById: admin.id,
          updatedById: admin.id,
        },
      }),
    ),
  );

  await prisma.clientReceipt.upsert({
    where: { id: ids.clientReceipt1 },
    update: { receiptReference: "DEV-CLI-001" },
    create: {
      id: ids.clientReceipt1,
      installmentId: ids.clientInstallment1,
      amount: "45000.0000",
      currencyCode: "EUR",
      receivedAt: new Date("2026-07-15T00:00:00.000Z"),
      fxRateToReporting: "1.0000000000",
      reportingAmount: "45000.0000",
      reportingCurrencyCode: "EUR",
      receiptReference: "DEV-CLI-001",
      createdById: admin.id,
      updatedById: admin.id,
    },
  });
}

async function main(): Promise<void> {
  await seedCurrencies();
  await seedRepresentativeProject();
  console.info(
    "Development seed completed with fictional representative data.",
  );
}

try {
  await main();
} catch (error) {
  console.error("Development seed failed.", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
