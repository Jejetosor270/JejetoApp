-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'USER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProcurementOrderStatus" AS ENUM ('DRAFT', 'QUOTED', 'APPROVED', 'ORDERED', 'DEPOSIT_DUE', 'DEPOSIT_PAID', 'IN_PRODUCTION', 'READY', 'BALANCE_DUE', 'PAID', 'IN_TRANSIT', 'DELIVERED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinancialState" AS ENUM ('BUDGET', 'COMMITTED', 'ACTUAL');

-- CreateEnum
CREATE TYPE "ProcurementCostCategory" AS ENUM ('SUPPLIER_PURCHASE', 'SUPPLIER_DISCOUNT', 'FREIGHT', 'CUSTOMS_DUTIES', 'MISCELLANEOUS');

-- CreateEnum
CREATE TYPE "FreightTreatment" AS ENUM ('INCLUDED_IN_PACKAGE_PRICE', 'RECHARGED_SEPARATELY', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "VatTreatment" AS ENUM ('DOMESTIC', 'INTRA_EU_SUPPLY', 'INTRA_EU_ACQUISITION', 'REVERSE_CHARGE', 'EXPORT', 'IMPORT', 'EXEMPT', 'OUT_OF_SCOPE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "VatDirection" AS ENUM ('INPUT', 'OUTPUT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UPCOMING', 'DUE_SOON', 'DUE', 'OVERDUE', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "authSubject" VARCHAR(255),
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "code" CHAR(3) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "minorUnits" INTEGER NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "legalName" VARCHAR(200) NOT NULL,
    "displayName" VARCHAR(160) NOT NULL,
    "billingAddressLine1" VARCHAR(200),
    "billingAddressLine2" VARCHAR(200),
    "billingCity" VARCHAR(120),
    "billingPostalCode" VARCHAR(32),
    "countryCode" CHAR(2),
    "vatNumber" VARCHAR(64),
    "defaultCurrencyCode" CHAR(3) NOT NULL,
    "contactName" VARCHAR(160),
    "email" VARCHAR(320),
    "phone" VARCHAR(50),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "legalName" VARCHAR(200) NOT NULL,
    "displayName" VARCHAR(160) NOT NULL,
    "addressLine1" VARCHAR(200),
    "addressLine2" VARCHAR(200),
    "city" VARCHAR(120),
    "postalCode" VARCHAR(32),
    "countryCode" CHAR(2),
    "vatNumber" VARCHAR(64),
    "defaultCurrencyCode" CHAR(3) NOT NULL,
    "contactName" VARCHAR(160),
    "email" VARCHAR(320),
    "phone" VARCHAR(50),
    "defaultPaymentTermsDays" INTEGER,
    "defaultLeadTimeWeeks" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "clientId" UUID NOT NULL,
    "countryCode" CHAR(2),
    "reportingCurrencyCode" CHAR(3) NOT NULL,
    "projectManagerId" UUID,
    "startDate" DATE,
    "expectedCompletionDate" DATE,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "shortCode" VARCHAR(32) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_orders" (
    "id" UUID NOT NULL,
    "orderNumber" VARCHAR(50) NOT NULL,
    "packageName" VARCHAR(200) NOT NULL,
    "projectId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "orderCurrencyCode" CHAR(3) NOT NULL,
    "status" "ProcurementOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "freightTreatment" "FreightTreatment" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "quoteDate" DATE,
    "orderDate" DATE,
    "acknowledgementDate" DATE,
    "leadTimeWeeks" INTEGER,
    "estimatedProductionAt" DATE,
    "actualProductionAt" DATE,
    "estimatedDispatchAt" DATE,
    "actualDispatchAt" DATE,
    "estimatedDeliveryAt" DATE,
    "actualDeliveryAt" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "procurement_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_order_buildings" (
    "orderId" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,

    CONSTRAINT "procurement_order_buildings_pkey" PRIMARY KEY ("orderId","buildingId")
);

-- CreateTable
CREATE TABLE "procurement_order_financials" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "state" "FinancialState" NOT NULL,
    "targetMarginRate" DECIMAL(9,6),
    "sellingPriceOriginalAmount" DECIMAL(19,4),
    "sellingPriceOriginalCurrencyCode" CHAR(3),
    "sellingPriceFxRate" DECIMAL(20,10),
    "sellingPriceReportingAmount" DECIMAL(19,4),
    "sellingPriceReportingCurrencyCode" CHAR(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "procurement_order_financials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_order_cost_lines" (
    "id" UUID NOT NULL,
    "financialsId" UUID NOT NULL,
    "category" "ProcurementCostCategory" NOT NULL,
    "description" VARCHAR(200),
    "originalAmount" DECIMAL(19,4) NOT NULL,
    "originalCurrencyCode" CHAR(3) NOT NULL,
    "fxRateToReporting" DECIMAL(20,10),
    "reportingAmount" DECIMAL(19,4),
    "reportingCurrencyCode" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "procurement_order_cost_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_order_vat_entries" (
    "id" UUID NOT NULL,
    "financialsId" UUID NOT NULL,
    "direction" "VatDirection" NOT NULL,
    "treatment" "VatTreatment" NOT NULL,
    "countryCode" CHAR(2),
    "customTreatmentNote" VARCHAR(240),
    "taxableBaseAmount" DECIMAL(19,4) NOT NULL,
    "vatRate" DECIMAL(9,6),
    "vatAmount" DECIMAL(19,4) NOT NULL,
    "originalCurrencyCode" CHAR(3) NOT NULL,
    "fxRateToReporting" DECIMAL(20,10),
    "reportingTaxableBase" DECIMAL(19,4),
    "reportingVatAmount" DECIMAL(19,4),
    "reportingCurrencyCode" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "procurement_order_vat_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payment_installments" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "percentageRate" DECIMAL(9,6),
    "expectedAmount" DECIMAL(19,4),
    "currencyCode" CHAR(3) NOT NULL,
    "expectedDueDate" DATE,
    "expectedFxRate" DECIMAL(20,10),
    "expectedReportingAmount" DECIMAL(19,4),
    "reportingCurrencyCode" CHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'UPCOMING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "supplier_payment_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "installmentId" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "paidAt" DATE NOT NULL,
    "fxRateToReporting" DECIMAL(20,10),
    "reportingAmount" DECIMAL(19,4),
    "reportingCurrencyCode" CHAR(3) NOT NULL,
    "paymentReference" VARCHAR(120),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_payment_installments" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "percentageRate" DECIMAL(9,6),
    "expectedAmount" DECIMAL(19,4),
    "currencyCode" CHAR(3) NOT NULL,
    "expectedDate" DATE,
    "expectedFxRate" DECIMAL(20,10),
    "expectedReportingAmount" DECIMAL(19,4),
    "reportingCurrencyCode" CHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'UPCOMING',
    "reference" VARCHAR(120),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "client_payment_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_receipts" (
    "id" UUID NOT NULL,
    "installmentId" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "receivedAt" DATE NOT NULL,
    "fxRateToReporting" DECIMAL(20,10),
    "reportingAmount" DECIMAL(19,4),
    "reportingCurrencyCode" CHAR(3) NOT NULL,
    "receiptReference" VARCHAR(120),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "client_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_authSubject_key" ON "users"("authSubject");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE INDEX "currencies_isActive_idx" ON "currencies"("isActive");

-- CreateIndex
CREATE INDEX "clients_displayName_idx" ON "clients"("displayName");

-- CreateIndex
CREATE INDEX "clients_isActive_idx" ON "clients"("isActive");

-- CreateIndex
CREATE INDEX "suppliers_displayName_idx" ON "suppliers"("displayName");

-- CreateIndex
CREATE INDEX "suppliers_isActive_idx" ON "suppliers"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE INDEX "projects_clientId_idx" ON "projects"("clientId");

-- CreateIndex
CREATE INDEX "projects_projectManagerId_idx" ON "projects"("projectManagerId");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "buildings_projectId_isActive_idx" ON "buildings"("projectId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_projectId_shortCode_key" ON "buildings"("projectId", "shortCode");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_orders_orderNumber_key" ON "procurement_orders"("orderNumber");

-- CreateIndex
CREATE INDEX "procurement_orders_projectId_idx" ON "procurement_orders"("projectId");

-- CreateIndex
CREATE INDEX "procurement_orders_supplierId_idx" ON "procurement_orders"("supplierId");

-- CreateIndex
CREATE INDEX "procurement_orders_status_idx" ON "procurement_orders"("status");

-- CreateIndex
CREATE INDEX "procurement_orders_estimatedDeliveryAt_idx" ON "procurement_orders"("estimatedDeliveryAt");

-- CreateIndex
CREATE INDEX "procurement_order_buildings_buildingId_idx" ON "procurement_order_buildings"("buildingId");

-- CreateIndex
CREATE INDEX "procurement_order_financials_state_idx" ON "procurement_order_financials"("state");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_order_financials_orderId_state_key" ON "procurement_order_financials"("orderId", "state");

-- CreateIndex
CREATE INDEX "procurement_order_cost_lines_financialsId_category_idx" ON "procurement_order_cost_lines"("financialsId", "category");

-- CreateIndex
CREATE INDEX "procurement_order_vat_entries_financialsId_direction_idx" ON "procurement_order_vat_entries"("financialsId", "direction");

-- CreateIndex
CREATE INDEX "supplier_payment_installments_status_expectedDueDate_idx" ON "supplier_payment_installments"("status", "expectedDueDate");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payment_installments_orderId_sequence_key" ON "supplier_payment_installments"("orderId", "sequence");

-- CreateIndex
CREATE INDEX "supplier_payments_installmentId_paidAt_idx" ON "supplier_payments"("installmentId", "paidAt");

-- CreateIndex
CREATE INDEX "client_payment_installments_status_expectedDate_idx" ON "client_payment_installments"("status", "expectedDate");

-- CreateIndex
CREATE UNIQUE INDEX "client_payment_installments_projectId_sequence_key" ON "client_payment_installments"("projectId", "sequence");

-- CreateIndex
CREATE INDEX "client_receipts_installmentId_receivedAt_idx" ON "client_receipts"("installmentId", "receivedAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_defaultCurrencyCode_fkey" FOREIGN KEY ("defaultCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_defaultCurrencyCode_fkey" FOREIGN KEY ("defaultCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_reportingCurrencyCode_fkey" FOREIGN KEY ("reportingCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_projectManagerId_fkey" FOREIGN KEY ("projectManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_orders" ADD CONSTRAINT "procurement_orders_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_orders" ADD CONSTRAINT "procurement_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_orders" ADD CONSTRAINT "procurement_orders_orderCurrencyCode_fkey" FOREIGN KEY ("orderCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_orders" ADD CONSTRAINT "procurement_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_orders" ADD CONSTRAINT "procurement_orders_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_buildings" ADD CONSTRAINT "procurement_order_buildings_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "procurement_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_buildings" ADD CONSTRAINT "procurement_order_buildings_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_buildings" ADD CONSTRAINT "procurement_order_buildings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_financials" ADD CONSTRAINT "procurement_order_financials_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "procurement_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_financials" ADD CONSTRAINT "procurement_order_financials_sellingPriceOriginalCurrencyC_fkey" FOREIGN KEY ("sellingPriceOriginalCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_financials" ADD CONSTRAINT "procurement_order_financials_sellingPriceReportingCurrency_fkey" FOREIGN KEY ("sellingPriceReportingCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_financials" ADD CONSTRAINT "procurement_order_financials_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_financials" ADD CONSTRAINT "procurement_order_financials_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_cost_lines" ADD CONSTRAINT "procurement_order_cost_lines_financialsId_fkey" FOREIGN KEY ("financialsId") REFERENCES "procurement_order_financials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_cost_lines" ADD CONSTRAINT "procurement_order_cost_lines_originalCurrencyCode_fkey" FOREIGN KEY ("originalCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_cost_lines" ADD CONSTRAINT "procurement_order_cost_lines_reportingCurrencyCode_fkey" FOREIGN KEY ("reportingCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_cost_lines" ADD CONSTRAINT "procurement_order_cost_lines_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_cost_lines" ADD CONSTRAINT "procurement_order_cost_lines_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_vat_entries" ADD CONSTRAINT "procurement_order_vat_entries_financialsId_fkey" FOREIGN KEY ("financialsId") REFERENCES "procurement_order_financials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_vat_entries" ADD CONSTRAINT "procurement_order_vat_entries_originalCurrencyCode_fkey" FOREIGN KEY ("originalCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_vat_entries" ADD CONSTRAINT "procurement_order_vat_entries_reportingCurrencyCode_fkey" FOREIGN KEY ("reportingCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_vat_entries" ADD CONSTRAINT "procurement_order_vat_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_order_vat_entries" ADD CONSTRAINT "procurement_order_vat_entries_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_installments" ADD CONSTRAINT "supplier_payment_installments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "procurement_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_installments" ADD CONSTRAINT "supplier_payment_installments_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_installments" ADD CONSTRAINT "supplier_payment_installments_reportingCurrencyCode_fkey" FOREIGN KEY ("reportingCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_installments" ADD CONSTRAINT "supplier_payment_installments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_installments" ADD CONSTRAINT "supplier_payment_installments_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "supplier_payment_installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_reportingCurrencyCode_fkey" FOREIGN KEY ("reportingCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_payment_installments" ADD CONSTRAINT "client_payment_installments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_payment_installments" ADD CONSTRAINT "client_payment_installments_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_payment_installments" ADD CONSTRAINT "client_payment_installments_reportingCurrencyCode_fkey" FOREIGN KEY ("reportingCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_payment_installments" ADD CONSTRAINT "client_payment_installments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_payment_installments" ADD CONSTRAINT "client_payment_installments_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_receipts" ADD CONSTRAINT "client_receipts_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "client_payment_installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_receipts" ADD CONSTRAINT "client_receipts_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_receipts" ADD CONSTRAINT "client_receipts_reportingCurrencyCode_fkey" FOREIGN KEY ("reportingCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_receipts" ADD CONSTRAINT "client_receipts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_receipts" ADD CONSTRAINT "client_receipts_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain integrity checks not currently expressible in the Prisma schema.
ALTER TABLE "currencies"
    ADD CONSTRAINT "currencies_code_uppercase_check" CHECK ("code" = upper("code")),
    ADD CONSTRAINT "currencies_minorUnits_check" CHECK ("minorUnits" BETWEEN 0 AND 4);

ALTER TABLE "suppliers"
    ADD CONSTRAINT "suppliers_payment_terms_check" CHECK ("defaultPaymentTermsDays" IS NULL OR "defaultPaymentTermsDays" >= 0),
    ADD CONSTRAINT "suppliers_lead_time_check" CHECK ("defaultLeadTimeWeeks" IS NULL OR "defaultLeadTimeWeeks" >= 0);

ALTER TABLE "projects"
    ADD CONSTRAINT "projects_date_order_check" CHECK (
        "startDate" IS NULL OR
        "expectedCompletionDate" IS NULL OR
        "expectedCompletionDate" >= "startDate"
    );

ALTER TABLE "procurement_orders"
    ADD CONSTRAINT "procurement_orders_lead_time_check" CHECK ("leadTimeWeeks" IS NULL OR "leadTimeWeeks" >= 0);

ALTER TABLE "procurement_order_financials"
    ADD CONSTRAINT "order_financials_target_margin_check" CHECK (
        "targetMarginRate" IS NULL OR
        ("targetMarginRate" >= 0 AND "targetMarginRate" < 1)
    ),
    ADD CONSTRAINT "order_financials_selling_price_check" CHECK (
        "sellingPriceOriginalAmount" IS NULL OR "sellingPriceOriginalAmount" >= 0
    ),
    ADD CONSTRAINT "order_financials_reporting_price_check" CHECK (
        "sellingPriceReportingAmount" IS NULL OR "sellingPriceReportingAmount" >= 0
    ),
    ADD CONSTRAINT "order_financials_fx_rate_check" CHECK (
        "sellingPriceFxRate" IS NULL OR "sellingPriceFxRate" > 0
    ),
    ADD CONSTRAINT "order_financials_original_currency_pair_check" CHECK (
        ("sellingPriceOriginalAmount" IS NULL) = ("sellingPriceOriginalCurrencyCode" IS NULL)
    );

ALTER TABLE "procurement_order_cost_lines"
    ADD CONSTRAINT "order_cost_lines_original_amount_check" CHECK ("originalAmount" >= 0),
    ADD CONSTRAINT "order_cost_lines_reporting_amount_check" CHECK (
        "reportingAmount" IS NULL OR "reportingAmount" >= 0
    ),
    ADD CONSTRAINT "order_cost_lines_fx_rate_check" CHECK (
        "fxRateToReporting" IS NULL OR "fxRateToReporting" > 0
    );

ALTER TABLE "procurement_order_vat_entries"
    ADD CONSTRAINT "order_vat_entries_rate_check" CHECK ("vatRate" IS NULL OR "vatRate" >= 0),
    ADD CONSTRAINT "order_vat_entries_fx_rate_check" CHECK (
        "fxRateToReporting" IS NULL OR "fxRateToReporting" > 0
    ),
    ADD CONSTRAINT "order_vat_entries_custom_treatment_check" CHECK (
        "treatment" <> 'CUSTOM' OR "customTreatmentNote" IS NOT NULL
    );

ALTER TABLE "supplier_payment_installments"
    ADD CONSTRAINT "supplier_installments_sequence_check" CHECK ("sequence" > 0),
    ADD CONSTRAINT "supplier_installments_value_check" CHECK (
        "percentageRate" IS NOT NULL OR "expectedAmount" IS NOT NULL
    ),
    ADD CONSTRAINT "supplier_installments_percentage_check" CHECK (
        "percentageRate" IS NULL OR ("percentageRate" > 0 AND "percentageRate" <= 1)
    ),
    ADD CONSTRAINT "supplier_installments_expected_amount_check" CHECK (
        "expectedAmount" IS NULL OR "expectedAmount" >= 0
    ),
    ADD CONSTRAINT "supplier_installments_fx_rate_check" CHECK (
        "expectedFxRate" IS NULL OR "expectedFxRate" > 0
    );

ALTER TABLE "supplier_payments"
    ADD CONSTRAINT "supplier_payments_amount_check" CHECK ("amount" > 0),
    ADD CONSTRAINT "supplier_payments_fx_rate_check" CHECK (
        "fxRateToReporting" IS NULL OR "fxRateToReporting" > 0
    );

ALTER TABLE "client_payment_installments"
    ADD CONSTRAINT "client_installments_sequence_check" CHECK ("sequence" > 0),
    ADD CONSTRAINT "client_installments_value_check" CHECK (
        "percentageRate" IS NOT NULL OR "expectedAmount" IS NOT NULL
    ),
    ADD CONSTRAINT "client_installments_percentage_check" CHECK (
        "percentageRate" IS NULL OR ("percentageRate" > 0 AND "percentageRate" <= 1)
    ),
    ADD CONSTRAINT "client_installments_expected_amount_check" CHECK (
        "expectedAmount" IS NULL OR "expectedAmount" >= 0
    ),
    ADD CONSTRAINT "client_installments_fx_rate_check" CHECK (
        "expectedFxRate" IS NULL OR "expectedFxRate" > 0
    );

ALTER TABLE "client_receipts"
    ADD CONSTRAINT "client_receipts_amount_check" CHECK ("amount" > 0),
    ADD CONSTRAINT "client_receipts_fx_rate_check" CHECK (
        "fxRateToReporting" IS NULL OR "fxRateToReporting" > 0
    );

-- An order may cover several buildings, but every linked building must belong
-- to the same project as the order.
CREATE FUNCTION "check_order_building_project"() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "procurement_orders" AS orders
        JOIN "buildings" AS buildings
          ON buildings."projectId" = orders."projectId"
        WHERE orders."id" = NEW."orderId"
          AND buildings."id" = NEW."buildingId"
    ) THEN
        RAISE EXCEPTION 'Procurement order and building must belong to the same project.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "procurement_order_buildings_project_check"
    BEFORE INSERT OR UPDATE ON "procurement_order_buildings"
    FOR EACH ROW EXECUTE FUNCTION "check_order_building_project"();
