-- Phase 11 keeps current Item access enabled for installations that already
-- have an application_settings row. New environments created after this
-- migration inherit the schema default of false when their row is created.
CREATE TYPE "ProjectTargetMode" AS ENUM ('MARKUP', 'EXPECTED_SELL');
CREATE TYPE "ClientBillingDocumentType" AS ENUM ('QUOTE', 'INVOICE');
CREATE TYPE "ClientBillingAllocationBasis" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE');
CREATE TYPE "ClientDocumentImportAction" AS ENUM ('CREATED', 'UPDATED');

ALTER TABLE "application_settings"
  ADD COLUMN "itemManagementEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "application_settings"
SET "itemManagementEnabled" = true;

INSERT INTO "application_settings" (
  "id",
  "companyName",
  "companyReportingCurrencyCode",
  "itemManagementEnabled",
  "createdAt",
  "updatedAt"
)
SELECT
  'company',
  'Procurement Finance ERP',
  'EUR',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "items")
  AND EXISTS (SELECT 1 FROM "currencies" WHERE "code" = 'EUR')
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "projects"
  ADD COLUMN "clientBudgetTargetHt" DECIMAL(19,4),
  ADD COLUMN "estimatedPurchaseCostHt" DECIMAL(19,4),
  ADD COLUMN "estimatedFreightCostHt" DECIMAL(19,4),
  ADD COLUMN "targetMarkupRate" DECIMAL(9,6),
  ADD COLUMN "expectedSellHt" DECIMAL(19,4),
  ADD COLUMN "targetMode" "ProjectTargetMode" NOT NULL DEFAULT 'MARKUP';

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_targets_non_negative_check" CHECK (
    ("clientBudgetTargetHt" IS NULL OR "clientBudgetTargetHt" >= 0) AND
    ("estimatedPurchaseCostHt" IS NULL OR "estimatedPurchaseCostHt" >= 0) AND
    ("estimatedFreightCostHt" IS NULL OR "estimatedFreightCostHt" >= 0) AND
    ("expectedSellHt" IS NULL OR "expectedSellHt" >= 0) AND
    ("targetMarkupRate" IS NULL OR "targetMarkupRate" >= 0)
  );

CREATE TABLE "client_billing_documents" (
  "id" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "documentType" "ClientBillingDocumentType" NOT NULL,
  "reference" VARCHAR(120) NOT NULL,
  "documentDate" DATE NOT NULL,
  "dueDate" DATE,
  "currencyCode" CHAR(3) NOT NULL,
  "fxRateToReporting" DECIMAL(20,10),
  "totalHt" DECIMAL(19,4) NOT NULL,
  "vatTreatment" "VatTreatment",
  "vatRate" DECIMAL(9,6),
  "vatAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "totalTtc" DECIMAL(19,4) NOT NULL,
  "paymentTermsRaw" TEXT,
  "notes" TEXT,
  "isCancelled" BOOLEAN NOT NULL DEFAULT false,
  "isProjectRemainderApproved" BOOLEAN NOT NULL DEFAULT false,
  "supersedesDocumentId" UUID,
  "matchedInstallmentId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" UUID,
  "updatedById" UUID,
  CONSTRAINT "client_billing_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_billing_amounts_non_negative_check" CHECK (
    "totalHt" >= 0 AND "vatAmount" >= 0 AND "totalTtc" >= 0 AND
    ("vatRate" IS NULL OR ("vatRate" >= 0 AND "vatRate" <= 1)) AND
    ("fxRateToReporting" IS NULL OR "fxRateToReporting" > 0)
  )
);

CREATE TABLE "client_payment_installments" (
  "id" UUID NOT NULL,
  "billingDocumentId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "label" VARCHAR(200) NOT NULL,
  "basis" "InstallmentBasis" NOT NULL,
  "percentageRate" DECIMAL(9,6),
  "scheduledAmount" DECIMAL(19,4) NOT NULL,
  "currencyCode" CHAR(3) NOT NULL,
  "dueDate" DATE NOT NULL,
  "expectedFxRateToReporting" DECIMAL(20,10),
  "isCancelled" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" UUID,
  "updatedById" UUID,
  CONSTRAINT "client_payment_installments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_installment_amount_check" CHECK (
    "scheduledAmount" > 0 AND
    ("percentageRate" IS NULL OR ("percentageRate" > 0 AND "percentageRate" <= 1)) AND
    ("expectedFxRateToReporting" IS NULL OR "expectedFxRateToReporting" > 0)
  ),
  CONSTRAINT "client_installment_basis_check" CHECK (
    ("basis" = 'PERCENTAGE' AND "percentageRate" IS NOT NULL) OR
    ("basis" = 'FIXED_AMOUNT' AND "percentageRate" IS NULL)
  )
);

CREATE TABLE "client_receipts" (
  "id" UUID NOT NULL,
  "installmentId" UUID NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "receivedAt" DATE NOT NULL,
  "fxRateToReporting" DECIMAL(20,10),
  "reference" VARCHAR(120),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" UUID,
  "updatedById" UUID,
  CONSTRAINT "client_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_receipt_amount_check" CHECK (
    "amount" > 0 AND ("fxRateToReporting" IS NULL OR "fxRateToReporting" > 0)
  )
);

CREATE TABLE "client_billing_allocations" (
  "id" UUID NOT NULL,
  "billingDocumentId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "basis" "ClientBillingAllocationBasis" NOT NULL,
  "percentageRate" DECIMAL(9,6),
  "allocatedAmount" DECIMAL(19,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" UUID,
  "updatedById" UUID,
  CONSTRAINT "client_billing_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_billing_allocation_amount_check" CHECK (
    "allocatedAmount" > 0 AND
    ("percentageRate" IS NULL OR ("percentageRate" > 0 AND "percentageRate" <= 1))
  ),
  CONSTRAINT "client_billing_allocation_basis_check" CHECK (
    ("basis" = 'PERCENTAGE' AND "percentageRate" IS NOT NULL) OR
    ("basis" = 'FIXED_AMOUNT' AND "percentageRate" IS NULL)
  )
);

CREATE TABLE "client_document_imports" (
  "id" UUID NOT NULL,
  "billingDocumentId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "documentType" "ClientBillingDocumentType" NOT NULL,
  "originalFilename" VARCHAR(255) NOT NULL,
  "documentReference" VARCHAR(120),
  "extractionProvider" VARCHAR(50) NOT NULL,
  "extractionModel" VARCHAR(120) NOT NULL,
  "duplicateWarning" BOOLEAN NOT NULL DEFAULT false,
  "action" "ClientDocumentImportAction" NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedById" UUID,
  CONSTRAINT "client_document_imports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_billing_documents_clientId_documentType_reference_key"
  ON "client_billing_documents"("clientId", "documentType", "reference");
CREATE INDEX "client_billing_documents_projectId_documentType_documentDate_idx"
  ON "client_billing_documents"("projectId", "documentType", "documentDate");
CREATE INDEX "client_billing_documents_clientId_documentType_documentDate_idx"
  ON "client_billing_documents"("clientId", "documentType", "documentDate");
CREATE INDEX "client_billing_documents_dueDate_idx" ON "client_billing_documents"("dueDate");
CREATE INDEX "client_billing_documents_matchedInstallmentId_idx" ON "client_billing_documents"("matchedInstallmentId");
CREATE UNIQUE INDEX "client_payment_installments_billingDocumentId_sequence_key"
  ON "client_payment_installments"("billingDocumentId", "sequence");
CREATE INDEX "client_payment_installments_dueDate_idx" ON "client_payment_installments"("dueDate");
CREATE INDEX "client_payment_installments_currencyCode_dueDate_idx" ON "client_payment_installments"("currencyCode", "dueDate");
CREATE INDEX "client_receipts_installmentId_receivedAt_idx" ON "client_receipts"("installmentId", "receivedAt");
CREATE UNIQUE INDEX "client_billing_allocations_billingDocumentId_orderId_key"
  ON "client_billing_allocations"("billingDocumentId", "orderId");
CREATE INDEX "client_billing_allocations_orderId_idx" ON "client_billing_allocations"("orderId");
CREATE INDEX "client_document_imports_billingDocumentId_processedAt_idx" ON "client_document_imports"("billingDocumentId", "processedAt");
CREATE INDEX "client_document_imports_clientId_documentReference_idx" ON "client_document_imports"("clientId", "documentReference");
CREATE INDEX "client_document_imports_projectId_processedAt_idx" ON "client_document_imports"("projectId", "processedAt");

ALTER TABLE "client_billing_documents" ADD CONSTRAINT "client_billing_documents_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_billing_documents" ADD CONSTRAINT "client_billing_documents_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_billing_documents" ADD CONSTRAINT "client_billing_documents_currencyCode_fkey"
  FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_billing_documents" ADD CONSTRAINT "client_billing_documents_supersedesDocumentId_fkey"
  FOREIGN KEY ("supersedesDocumentId") REFERENCES "client_billing_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_billing_documents" ADD CONSTRAINT "client_billing_documents_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_billing_documents" ADD CONSTRAINT "client_billing_documents_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client_payment_installments" ADD CONSTRAINT "client_payment_installments_billingDocumentId_fkey"
  FOREIGN KEY ("billingDocumentId") REFERENCES "client_billing_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_payment_installments" ADD CONSTRAINT "client_payment_installments_currencyCode_fkey"
  FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_payment_installments" ADD CONSTRAINT "client_payment_installments_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_payment_installments" ADD CONSTRAINT "client_payment_installments_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client_billing_documents" ADD CONSTRAINT "client_billing_documents_matchedInstallmentId_fkey"
  FOREIGN KEY ("matchedInstallmentId") REFERENCES "client_payment_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client_receipts" ADD CONSTRAINT "client_receipts_installmentId_fkey"
  FOREIGN KEY ("installmentId") REFERENCES "client_payment_installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_receipts" ADD CONSTRAINT "client_receipts_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_receipts" ADD CONSTRAINT "client_receipts_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client_billing_allocations" ADD CONSTRAINT "client_billing_allocations_billingDocumentId_fkey"
  FOREIGN KEY ("billingDocumentId") REFERENCES "client_billing_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_billing_allocations" ADD CONSTRAINT "client_billing_allocations_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "procurement_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_billing_allocations" ADD CONSTRAINT "client_billing_allocations_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_billing_allocations" ADD CONSTRAINT "client_billing_allocations_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client_document_imports" ADD CONSTRAINT "client_document_imports_billingDocumentId_fkey"
  FOREIGN KEY ("billingDocumentId") REFERENCES "client_billing_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_document_imports" ADD CONSTRAINT "client_document_imports_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_document_imports" ADD CONSTRAINT "client_document_imports_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_document_imports" ADD CONSTRAINT "client_document_imports_processedById_fkey"
  FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
