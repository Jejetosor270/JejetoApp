import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import {
  FreightTreatment,
  InstallmentBasis,
  PaymentDirection,
  PrismaClient,
  ProcurementCostCategory,
  ProcurementOrderStatus,
  ProjectStatus,
  UserRole,
  VatDirection,
  VatRecoverability,
  VatTreatment,
} from "../src/generated/prisma/client";

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error("Set DIRECT_URL or DATABASE_URL before seeding.");
if (process.env.NODE_ENV === "production")
  throw new Error("Development seed is disabled in production.");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const ids = {
  admin: "10000000-0000-4000-8000-000000000001",
  client: "20000000-0000-4000-8000-000000000001",
  supplier: "30000000-0000-4000-8000-000000000001",
  project: "40000000-0000-4000-8000-000000000001",
  building: "50000000-0000-4000-8000-000000000001",
  order: "60000000-0000-4000-8000-000000000001",
  order2: "60000000-0000-4000-8000-000000000002",
  supplierInstallment1: "70000000-0000-4000-8000-000000000001",
  supplierInstallment2: "70000000-0000-4000-8000-000000000002",
  clientInstallment1: "70000000-0000-4000-8000-000000000003",
  clientInstallment2: "70000000-0000-4000-8000-000000000004",
  supplierInstallment3: "70000000-0000-4000-8000-000000000005",
  supplierInstallment4: "70000000-0000-4000-8000-000000000006",
  supplierInstallment5: "70000000-0000-4000-8000-000000000007",
  clientInstallment3: "70000000-0000-4000-8000-000000000008",
} as const;

async function main(): Promise<void> {
  await Promise.all(
    ["EUR", "USD", "GBP", "CHF"].map((code) =>
      prisma.currency.upsert({
        where: { code },
        update: { isActive: true },
        create: {
          code,
          name:
            {
              EUR: "Euro",
              USD: "US Dollar",
              GBP: "Pound Sterling",
              CHF: "Swiss Franc",
            }[code] ?? code,
        },
      }),
    ),
  );
  const admin = await prisma.user.upsert({
    where: { id: ids.admin },
    update: {
      name: "Development Administrator",
      email: "admin@example.invalid",
      isActive: false,
      role: UserRole.ADMIN,
    },
    create: {
      id: ids.admin,
      name: "Development Administrator",
      email: "admin@example.invalid",
      isActive: false,
      role: UserRole.ADMIN,
    },
  });
  const client = await prisma.client.upsert({
    where: { id: ids.client },
    update: {
      legalName: "Example Client Ltd.",
      displayName: "Example Client",
      countryCode: "BE",
      defaultCurrencyCode: "EUR",
    },
    create: {
      id: ids.client,
      legalName: "Example Client Ltd.",
      displayName: "Example Client",
      countryCode: "BE",
      defaultCurrencyCode: "EUR",
      createdById: admin.id,
      updatedById: admin.id,
    },
  });
  const supplier = await prisma.supplier.upsert({
    where: { id: ids.supplier },
    update: {
      legalName: "Example Supplier Ltd.",
      displayName: "Example Supplier",
      countryCode: "CH",
      defaultCurrencyCode: "USD",
    },
    create: {
      id: ids.supplier,
      legalName: "Example Supplier Ltd.",
      displayName: "Example Supplier",
      countryCode: "CH",
      defaultCurrencyCode: "USD",
      createdById: admin.id,
      updatedById: admin.id,
    },
  });
  const project = await prisma.project.upsert({
    where: { id: ids.project },
    update: {
      clientId: client.id,
      name: "Example Project",
      code: "DEMO-001",
      countryCode: "BE",
      reportingCurrencyCode: "EUR",
      status: ProjectStatus.ACTIVE,
    },
    create: {
      id: ids.project,
      clientId: client.id,
      name: "Example Project",
      code: "DEMO-001",
      countryCode: "BE",
      reportingCurrencyCode: "EUR",
      status: ProjectStatus.ACTIVE,
      createdById: admin.id,
      updatedById: admin.id,
    },
  });
  const building = await prisma.building.upsert({
    where: { id: ids.building },
    update: {
      projectId: project.id,
      name: "Example Building",
      shortCode: "B1",
    },
    create: {
      id: ids.building,
      projectId: project.id,
      name: "Example Building",
      shortCode: "B1",
      createdById: admin.id,
      updatedById: admin.id,
    },
  });
  const orders = [
    {
      id: ids.order,
      orderNumber: "DEMO-001-PO-001",
      packageName: "Furniture Package",
      orderCurrencyCode: "USD",
      purchaseFxRateToReporting: "0.8575000000",
      sellingCurrencyCode: "EUR",
      sellingFxRateToReporting: null,
      sellingPriceAmount: "90000",
      freightTreatment: FreightTreatment.INCLUDED_IN_PACKAGE_PRICE,
      costs: [
        [ProcurementCostCategory.SUPPLIER_PURCHASE, "60000"],
        [ProcurementCostCategory.FREIGHT, "5000"],
      ] as const,
      orderDate: new Date("2026-06-15T00:00:00.000Z"),
      leadTimeWeeks: 10,
      expectedReadyDate: new Date("2026-08-24T00:00:00.000Z"),
      expectedDeliveryDate: new Date("2026-09-15T00:00:00.000Z"),
      input: {
        treatment: VatTreatment.INTRA_EU_ACQUISITION,
        recoverability: VatRecoverability.RECOVERABLE,
        taxableBaseAmount: "60000",
        vatRate: "0",
        vatAmount: "0",
      },
      output: {
        treatment: VatTreatment.DOMESTIC,
        taxableBaseAmount: "90000",
        vatRate: "0.20",
        vatAmount: "18000",
      },
    },
    {
      id: ids.order2,
      orderNumber: "DEMO-001-PO-002",
      packageName: "Lighting Package",
      orderCurrencyCode: "CHF",
      purchaseFxRateToReporting: "1.0400000000",
      sellingCurrencyCode: "GBP",
      sellingFxRateToReporting: "1.1700000000",
      sellingPriceAmount: "80000",
      freightTreatment: FreightTreatment.RECHARGED_SEPARATELY,
      freightResaleAmount: "2000",
      costs: [
        [ProcurementCostCategory.SUPPLIER_PURCHASE, "30000"],
        [ProcurementCostCategory.CUSTOMS_DUTIES, "1200"],
      ] as const,
      orderDate: new Date("2026-07-01T00:00:00.000Z"),
      leadTimeWeeks: 12,
      expectedReadyDate: new Date("2026-09-23T00:00:00.000Z"),
      expectedDeliveryDate: new Date("2026-10-12T00:00:00.000Z"),
      input: {
        treatment: VatTreatment.IMPORT,
        recoverability: VatRecoverability.NON_RECOVERABLE,
        taxableBaseAmount: "30000",
        vatRate: "0.08",
        vatAmount: "2400",
      },
      output: {
        treatment: VatTreatment.EXPORT,
        taxableBaseAmount: "82000",
        vatRate: "0",
        vatAmount: "0",
      },
    },
  ];
  for (const item of orders) {
    const order = await prisma.procurementOrder.upsert({
      where: { id: item.id },
      update: {
        orderNumber: item.orderNumber,
        packageName: item.packageName,
        projectId: project.id,
        supplierId: supplier.id,
        orderCurrencyCode: item.orderCurrencyCode,
        purchaseFxRateToReporting: item.purchaseFxRateToReporting,
        sellingCurrencyCode: item.sellingCurrencyCode,
        sellingFxRateToReporting: item.sellingFxRateToReporting,
        sellingPriceAmount: item.sellingPriceAmount,
        freightTreatment: item.freightTreatment,
        freightResaleAmount: item.freightResaleAmount ?? null,
        orderDate: item.orderDate,
        leadTimeWeeks: item.leadTimeWeeks,
        expectedReadyDate: item.expectedReadyDate,
        expectedDeliveryDate: item.expectedDeliveryDate,
        status: ProcurementOrderStatus.ORDERED,
        updatedById: admin.id,
      },
      create: {
        id: item.id,
        orderNumber: item.orderNumber,
        packageName: item.packageName,
        projectId: project.id,
        supplierId: supplier.id,
        orderCurrencyCode: item.orderCurrencyCode,
        purchaseFxRateToReporting: item.purchaseFxRateToReporting,
        sellingCurrencyCode: item.sellingCurrencyCode,
        sellingFxRateToReporting: item.sellingFxRateToReporting,
        sellingPriceAmount: item.sellingPriceAmount,
        freightTreatment: item.freightTreatment,
        freightResaleAmount: item.freightResaleAmount ?? null,
        orderDate: item.orderDate,
        leadTimeWeeks: item.leadTimeWeeks,
        expectedReadyDate: item.expectedReadyDate,
        expectedDeliveryDate: item.expectedDeliveryDate,
        status: ProcurementOrderStatus.ORDERED,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    await prisma.procurementOrderBuilding.upsert({
      where: {
        orderId_buildingId: { orderId: order.id, buildingId: building.id },
      },
      update: {},
      create: {
        orderId: order.id,
        buildingId: building.id,
        createdById: admin.id,
      },
    });
    await Promise.all([
      prisma.procurementOrderCostLine.deleteMany({
        where: { orderId: order.id },
      }),
      prisma.procurementOrderVatEntry.deleteMany({
        where: { orderId: order.id },
      }),
    ]);
    await prisma.procurementOrderCostLine.createMany({
      data: item.costs.map(([category, originalAmount]) => ({
        orderId: order.id,
        category,
        originalAmount,
        createdById: admin.id,
        updatedById: admin.id,
      })),
    });
    await prisma.procurementOrderVatEntry.createMany({
      data: [
        {
          orderId: order.id,
          direction: VatDirection.INPUT,
          countryCode: "CH",
          isAmountOverride: false,
          createdById: admin.id,
          updatedById: admin.id,
          ...item.input,
        },
        {
          orderId: order.id,
          direction: VatDirection.OUTPUT,
          countryCode: "BE",
          isAmountOverride: false,
          recoverability: null,
          createdById: admin.id,
          updatedById: admin.id,
          ...item.output,
        },
      ],
    });
  }
  await prisma.paymentSettlement.deleteMany({
    where: { installment: { orderId: { in: [ids.order, ids.order2] } } },
  });
  await prisma.paymentInstallment.deleteMany({
    where: { orderId: { in: [ids.order, ids.order2] } },
  });
  await prisma.paymentInstallment.createMany({
    data: [
      {
        id: ids.supplierInstallment1,
        orderId: ids.order,
        direction: PaymentDirection.SUPPLIER_PAYMENT,
        sequence: 1,
        label: "Deposit",
        basis: InstallmentBasis.PERCENTAGE,
        percentageRate: "0.50",
        scheduledAmount: "30000",
        currencyCode: "USD",
        dueDate: new Date("2026-07-01T00:00:00.000Z"),
        expectedFxRateToReporting: "0.8575",
        createdById: admin.id,
        updatedById: admin.id,
      },
      {
        id: ids.supplierInstallment2,
        orderId: ids.order,
        direction: PaymentDirection.SUPPLIER_PAYMENT,
        sequence: 2,
        label: "Balance",
        basis: InstallmentBasis.PERCENTAGE,
        percentageRate: "0.50",
        scheduledAmount: "30000",
        currencyCode: "USD",
        dueDate: new Date("2026-09-01T00:00:00.000Z"),
        expectedFxRateToReporting: "0.8500",
        createdById: admin.id,
        updatedById: admin.id,
      },
      {
        id: ids.clientInstallment1,
        orderId: ids.order,
        direction: PaymentDirection.CLIENT_RECEIPT,
        sequence: 1,
        label: "Client deposit",
        basis: InstallmentBasis.PERCENTAGE,
        percentageRate: "0.30",
        scheduledAmount: "32400",
        currencyCode: "EUR",
        dueDate: new Date("2026-08-10T00:00:00.000Z"),
        createdById: admin.id,
        updatedById: admin.id,
      },
      {
        id: ids.clientInstallment2,
        orderId: ids.order,
        direction: PaymentDirection.CLIENT_RECEIPT,
        sequence: 2,
        label: "Client balance",
        basis: InstallmentBasis.PERCENTAGE,
        percentageRate: "0.70",
        scheduledAmount: "75600",
        currencyCode: "EUR",
        dueDate: new Date("2026-10-01T00:00:00.000Z"),
        createdById: admin.id,
        updatedById: admin.id,
      },
      ...[
        [ids.supplierInstallment3, 1, "Deposit", "0.30", "9000", "2026-08-01"],
        [
          ids.supplierInstallment4,
          2,
          "Production payment",
          "0.40",
          "12000",
          "2026-09-15",
        ],
        [ids.supplierInstallment5, 3, "Balance", "0.30", "9000", "2026-10-15"],
      ].map(
        ([id, sequence, label, percentageRate, scheduledAmount, dueDate]) => ({
          id: String(id),
          orderId: ids.order2,
          direction: PaymentDirection.SUPPLIER_PAYMENT,
          sequence: Number(sequence),
          label: String(label),
          basis: InstallmentBasis.PERCENTAGE,
          percentageRate: String(percentageRate),
          scheduledAmount: String(scheduledAmount),
          currencyCode: "CHF",
          dueDate: new Date(`${String(dueDate)}T00:00:00.000Z`),
          expectedFxRateToReporting: "1.04",
          createdById: admin.id,
          updatedById: admin.id,
        }),
      ),
      {
        id: ids.clientInstallment3,
        orderId: ids.order2,
        direction: PaymentDirection.CLIENT_RECEIPT,
        sequence: 1,
        label: "Full client payment",
        basis: InstallmentBasis.PERCENTAGE,
        percentageRate: "1",
        scheduledAmount: "82000",
        currencyCode: "GBP",
        dueDate: new Date("2026-09-30T00:00:00.000Z"),
        expectedFxRateToReporting: "1.17",
        createdById: admin.id,
        updatedById: admin.id,
      },
    ],
  });
  await prisma.paymentSettlement.createMany({
    data: [
      {
        installmentId: ids.supplierInstallment1,
        amount: "30000",
        settledAt: new Date("2026-07-01T00:00:00.000Z"),
        fxRateToReporting: "0.86",
        reference: "DEMO-PAY-001",
        createdById: admin.id,
        updatedById: admin.id,
      },
      {
        installmentId: ids.clientInstallment1,
        amount: "10000",
        settledAt: new Date("2026-08-10T00:00:00.000Z"),
        reference: "DEMO-REC-001",
        createdById: admin.id,
        updatedById: admin.id,
      },
    ],
  });
}
main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
