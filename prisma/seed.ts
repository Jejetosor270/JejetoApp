import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import {
  FinancialState,
  FreightTreatment,
  PaymentStatus,
  PrismaClient,
  ProcurementCostCategory,
  ProcurementOrderStatus,
  PricingMode,
  ProjectStatus,
  UserRole,
  VatDirection,
  VatTreatment,
} from "../src/generated/prisma/client";

const ids = {
  admin: "10000000-0000-4000-8000-000000000001",
  client: "20000000-0000-4000-8000-000000000001",
  supplier: "30000000-0000-4000-8000-000000000001",
  supplier2: "30000000-0000-4000-8000-000000000002",
  project: "40000000-0000-4000-8000-000000000001",
  project2: "40000000-0000-4000-8000-000000000002",
  villa1: "50000000-0000-4000-8000-000000000001",
  villa2: "50000000-0000-4000-8000-000000000002",
  villa3: "50000000-0000-4000-8000-000000000003",
  buildingA: "50000000-0000-4000-8000-000000000004",
  order: "60000000-0000-4000-8000-000000000001",
  order2: "60000000-0000-4000-8000-000000000002",
  financials: "70000000-0000-4000-8000-000000000001",
  budgetFinancials: "70000000-0000-4000-8000-000000000002",
  actualFinancials: "70000000-0000-4000-8000-000000000003",
  order2BudgetFinancials: "70000000-0000-4000-8000-000000000004",
  order2CommittedFinancials: "70000000-0000-4000-8000-000000000005",
  order2ActualFinancials: "70000000-0000-4000-8000-000000000006",
  purchaseCost: "71000000-0000-4000-8000-000000000001",
  discountCost: "71000000-0000-4000-8000-000000000002",
  freightCost: "71000000-0000-4000-8000-000000000003",
  budgetPurchaseCost: "71000000-0000-4000-8000-000000000004",
  budgetFreightCost: "71000000-0000-4000-8000-000000000005",
  actualPurchaseCost: "71000000-0000-4000-8000-000000000006",
  actualFreightCost: "71000000-0000-4000-8000-000000000007",
  order2BudgetPurchaseCost: "71000000-0000-4000-8000-000000000008",
  order2CommittedPurchaseCost: "71000000-0000-4000-8000-000000000009",
  order2ActualPurchaseCost: "71000000-0000-4000-8000-000000000010",
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
      email: "admin@example.invalid",
      isActive: false,
      name: "Development Administrator",
      role: UserRole.ADMIN,
    },
    create: {
      id: ids.admin,
      email: "admin@example.invalid",
      isActive: false,
      name: "Development Administrator",
      role: UserRole.ADMIN,
    },
  });

  await prisma.client.upsert({
    where: { id: ids.client },
    update: {
      countryCode: "BE",
      displayName: "Example Client",
      legalName: "Example Client Ltd.",
    },
    create: {
      id: ids.client,
      legalName: "Example Client Ltd.",
      displayName: "Example Client",
      countryCode: "BE",
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
      defaultPaymentTermsNotes: "Example development data only.",
      displayName: "Example Supplier",
      legalName: "Example Supplier Ltd.",
    },
    create: {
      id: ids.supplier,
      legalName: "Example Supplier Ltd.",
      displayName: "Example Supplier",
      countryCode: "IT",
      defaultCurrencyCode: "EUR",
      defaultLeadTimeWeeks: 14,
      defaultPaymentTermsDays: 30,
      defaultPaymentTermsNotes: "Example development data only.",
      isActive: true,
      notes: "Representative development data only.",
      createdById: admin.id,
      updatedById: admin.id,
    },
  });

  await prisma.supplier.upsert({
    where: { id: ids.supplier2 },
    update: { displayName: "Example Supplier Two" },
    create: {
      id: ids.supplier2,
      legalName: "Example Supplier Two Ltd.",
      displayName: "Example Supplier Two",
      countryCode: "FR",
      defaultCurrencyCode: "EUR",
      defaultLeadTimeWeeks: 10,
      isActive: true,
      notes: "Example development data only.",
      createdById: admin.id,
      updatedById: admin.id,
    },
  });

  await prisma.project.upsert({
    where: { id: ids.project },
    update: {
      code: "DEMO-001",
      countryCode: "BE",
      name: "Example Project",
      status: ProjectStatus.ACTIVE,
    },
    create: {
      id: ids.project,
      clientId: ids.client,
      code: "DEMO-001",
      countryCode: "BE",
      expectedCompletionDate: new Date("2027-06-30T00:00:00.000Z"),
      name: "Example Project",
      projectManagerId: admin.id,
      reportingCurrencyCode: "EUR",
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      status: ProjectStatus.ACTIVE,
      notes: "Representative development project.",
      createdById: admin.id,
      updatedById: admin.id,
    },
  });

  await prisma.project.upsert({
    where: { id: ids.project2 },
    update: { name: "Example Project Two", status: ProjectStatus.PLANNING },
    create: {
      id: ids.project2,
      clientId: ids.client,
      code: "DEMO-002",
      countryCode: "FR",
      name: "Example Project Two",
      projectManagerId: admin.id,
      reportingCurrencyCode: "EUR",
      status: ProjectStatus.PLANNING,
      notes: "Example development project.",
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

  await prisma.building.upsert({
    where: { id: ids.buildingA },
    update: { name: "Building A", shortCode: "A" },
    create: {
      id: ids.buildingA,
      name: "Building A",
      shortCode: "A",
      projectId: ids.project2,
      createdById: admin.id,
      updatedById: admin.id,
    },
  });

  await prisma.procurementOrder.upsert({
    where: { id: ids.order },
    update: {
      packageName: "Loose Furniture Package",
      pricingMode: PricingMode.SELLING_PRICE,
      sellingCurrencyCode: "EUR",
      sellingPriceAmount: "90000.0000",
      targetMarginRate: null,
      status: ProcurementOrderStatus.ORDERED,
    },
    create: {
      id: ids.order,
      orderNumber: "DEMO-001-PO-001",
      packageName: "Loose Furniture Package",
      projectId: ids.project,
      supplierId: ids.supplier,
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
      sellingPriceAmount: "90000.0000",
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

  await prisma.procurementOrder.upsert({
    where: { id: ids.order2 },
    update: {
      freightResaleAmount: "2000.0000",
      freightTreatment: FreightTreatment.RECHARGED_SEPARATELY,
      pricingMode: PricingMode.TARGET_MARGIN,
      sellingCurrencyCode: "EUR",
      sellingPriceAmount: null,
      targetMarginRate: "0.250000",
    },
    create: {
      id: ids.order2,
      orderNumber: "DEMO-002-PO-001",
      packageName: "Decorative Lighting Package",
      category: "Lighting",
      projectId: ids.project2,
      supplierId: ids.supplier2,
      orderCurrencyCode: "EUR",
      sellingCurrencyCode: "EUR",
      pricingMode: PricingMode.TARGET_MARGIN,
      pricingSourceState: FinancialState.COMMITTED,
      targetMarginRate: "0.250000",
      freightTreatment: FreightTreatment.RECHARGED_SEPARATELY,
      freightResaleAmount: "2000.0000",
      status: ProcurementOrderStatus.QUOTED,
      createdById: admin.id,
      updatedById: admin.id,
    },
  });

  await prisma.procurementOrderBuilding.upsert({
    where: {
      orderId_buildingId: {
        orderId: ids.order2,
        buildingId: ids.buildingA,
      },
    },
    update: {},
    create: {
      orderId: ids.order2,
      buildingId: ids.buildingA,
      createdById: admin.id,
    },
  });

  await prisma.procurementOrderFinancials.upsert({
    where: { id: ids.financials },
    update: { state: FinancialState.COMMITTED },
    create: {
      id: ids.financials,
      orderId: ids.order,
      state: FinancialState.COMMITTED,
      createdById: admin.id,
      updatedById: admin.id,
    },
  });

  await Promise.all(
    [
      {
        id: ids.budgetFinancials,
        state: FinancialState.BUDGET,
      },
      {
        id: ids.actualFinancials,
        state: FinancialState.ACTUAL,
        orderId: ids.order,
      },
      {
        id: ids.order2BudgetFinancials,
        state: FinancialState.BUDGET,
        orderId: ids.order2,
      },
      {
        id: ids.order2CommittedFinancials,
        state: FinancialState.COMMITTED,
        orderId: ids.order2,
      },
      {
        id: ids.order2ActualFinancials,
        state: FinancialState.ACTUAL,
        orderId: ids.order2,
      },
    ].map((financials) =>
      prisma.procurementOrderFinancials.upsert({
        where: { id: financials.id },
        update: { state: financials.state },
        create: {
          ...financials,
          orderId: financials.orderId ?? ids.order,
          createdById: admin.id,
          updatedById: admin.id,
        },
      }),
    ),
  );

  const costLines = [
    {
      id: ids.purchaseCost,
      financialsId: ids.financials,
      category: ProcurementCostCategory.SUPPLIER_PURCHASE,
      description: "Accepted supplier package",
      originalAmount: "60000.0000",
    },
    {
      id: ids.discountCost,
      financialsId: ids.financials,
      category: ProcurementCostCategory.SUPPLIER_DISCOUNT,
      description: "Commercial supplier discount",
      originalAmount: "3000.0000",
    },
    {
      id: ids.freightCost,
      financialsId: ids.financials,
      category: ProcurementCostCategory.FREIGHT,
      description: "Forecast inbound freight",
      originalAmount: "5000.0000",
    },
    {
      id: ids.budgetPurchaseCost,
      financialsId: ids.budgetFinancials,
      category: ProcurementCostCategory.SUPPLIER_PURCHASE,
      description: "Budget supplier package",
      originalAmount: "65000.0000",
    },
    {
      id: ids.budgetFreightCost,
      financialsId: ids.budgetFinancials,
      category: ProcurementCostCategory.FREIGHT,
      description: "Budget freight",
      originalAmount: "5500.0000",
    },
    {
      id: ids.actualPurchaseCost,
      financialsId: ids.actualFinancials,
      category: ProcurementCostCategory.SUPPLIER_PURCHASE,
      description: "Actual supplier package",
      originalAmount: "61000.0000",
    },
    {
      id: ids.actualFreightCost,
      financialsId: ids.actualFinancials,
      category: ProcurementCostCategory.FREIGHT,
      description: "Actual freight",
      originalAmount: "5200.0000",
    },
    {
      id: ids.order2BudgetPurchaseCost,
      financialsId: ids.order2BudgetFinancials,
      category: ProcurementCostCategory.SUPPLIER_PURCHASE,
      description: "Budget supplier package",
      originalAmount: "32000.0000",
    },
    {
      id: ids.order2CommittedPurchaseCost,
      financialsId: ids.order2CommittedFinancials,
      category: ProcurementCostCategory.SUPPLIER_PURCHASE,
      description: "Committed supplier package",
      originalAmount: "30000.0000",
    },
    {
      id: ids.order2ActualPurchaseCost,
      financialsId: ids.order2ActualFinancials,
      category: ProcurementCostCategory.SUPPLIER_PURCHASE,
      description: "Actual supplier package",
      originalAmount: "30500.0000",
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
          financialsId: line.financialsId,
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
      countryCode: "BE",
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
