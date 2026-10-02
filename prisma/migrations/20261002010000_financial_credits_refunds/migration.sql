-- Reviewed credit adjustments and actual refunds. Original financial records are unchanged.
-- Prepared only: deployment is a separately authorized operation.

-- CreateTable
CREATE TABLE "financial_credits" (
    "id" UUID NOT NULL,
    "side" VARCHAR(8) NOT NULL,
    "billingDocumentId" UUID,
    "orderId" UUID,
    "supplierVatEntryId" UUID,
    "reference" VARCHAR(120) NOT NULL,
    "creditDate" DATE NOT NULL,
    "reason" VARCHAR(4000) NOT NULL,
    "totalHt" DECIMAL(19,4) NOT NULL,
    "vatAmount" DECIMAL(19,4) NOT NULL,
    "freightCoverageHt" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "otherCoverageHt" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currencyCode" CHAR(3) NOT NULL,
    "reportingCurrencyCode" CHAR(3) NOT NULL,
    "fxRateToReporting" DECIMAL(20,10),
    "supplierRecoverableRate" DECIMAL(9,6),
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "financial_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_credit_allocations" (
    "id" UUID NOT NULL,
    "creditId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "amountHt" DECIMAL(19,4) NOT NULL,
    "freightCoverageHt" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "otherCoverageHt" DECIMAL(19,4) NOT NULL DEFAULT 0,

    CONSTRAINT "financial_credit_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_credit_refunds" (
    "id" UUID NOT NULL,
    "creditId" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "refundDate" DATE NOT NULL,
    "fxRateToReporting" DECIMAL(20,10),
    "reference" VARCHAR(120),
    "notes" VARCHAR(4000),
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "financial_credit_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_credits_billingDocumentId_isCancelled_idx" ON "financial_credits"("billingDocumentId", "isCancelled");

-- CreateIndex
CREATE INDEX "financial_credits_orderId_isCancelled_idx" ON "financial_credits"("orderId", "isCancelled");

-- CreateIndex
CREATE INDEX "financial_credits_supplierVatEntryId_idx" ON "financial_credits"("supplierVatEntryId");

-- CreateIndex
CREATE INDEX "financial_credits_currencyCode_idx" ON "financial_credits"("currencyCode");

-- CreateIndex
CREATE INDEX "financial_credits_reportingCurrencyCode_idx" ON "financial_credits"("reportingCurrencyCode");

-- CreateIndex
CREATE INDEX "financial_credits_createdById_idx" ON "financial_credits"("createdById");

-- CreateIndex
CREATE INDEX "financial_credits_updatedById_idx" ON "financial_credits"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "financial_credits_billingDocumentId_reference_key" ON "financial_credits"("billingDocumentId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "financial_credits_orderId_reference_key" ON "financial_credits"("orderId", "reference");

-- CreateIndex
CREATE INDEX "financial_credit_allocations_orderId_idx" ON "financial_credit_allocations"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_credit_allocations_creditId_orderId_key" ON "financial_credit_allocations"("creditId", "orderId");

-- CreateIndex
CREATE INDEX "financial_credit_refunds_creditId_isCancelled_idx" ON "financial_credit_refunds"("creditId", "isCancelled");

-- CreateIndex
CREATE INDEX "financial_credit_refunds_refundDate_idx" ON "financial_credit_refunds"("refundDate");

-- CreateIndex
CREATE INDEX "financial_credit_refunds_createdById_idx" ON "financial_credit_refunds"("createdById");

-- CreateIndex
CREATE INDEX "financial_credit_refunds_updatedById_idx" ON "financial_credit_refunds"("updatedById");

-- AddForeignKey
ALTER TABLE "financial_credits" ADD CONSTRAINT "financial_credits_billingDocumentId_fkey" FOREIGN KEY ("billingDocumentId") REFERENCES "client_billing_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_credits" ADD CONSTRAINT "financial_credits_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "procurement_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_credits" ADD CONSTRAINT "financial_credits_supplierVatEntryId_fkey" FOREIGN KEY ("supplierVatEntryId") REFERENCES "procurement_order_vat_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_credits" ADD CONSTRAINT "financial_credits_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_credits" ADD CONSTRAINT "financial_credits_reportingCurrencyCode_fkey" FOREIGN KEY ("reportingCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_credits" ADD CONSTRAINT "financial_credits_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_credits" ADD CONSTRAINT "financial_credits_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_credit_allocations" ADD CONSTRAINT "financial_credit_allocations_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "financial_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_credit_allocations" ADD CONSTRAINT "financial_credit_allocations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "procurement_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_credit_refunds" ADD CONSTRAINT "financial_credit_refunds_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "financial_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_credit_refunds" ADD CONSTRAINT "financial_credit_refunds_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_credit_refunds" ADD CONSTRAINT "financial_credit_refunds_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "financial_credits" ADD CONSTRAINT "financial_credits_source_check" CHECK (
  ("side" = 'CLIENT' AND "billingDocumentId" IS NOT NULL AND "orderId" IS NULL AND "supplierVatEntryId" IS NULL AND "supplierRecoverableRate" IS NULL)
  OR ("side" = 'SUPPLIER' AND "orderId" IS NOT NULL AND "billingDocumentId" IS NULL AND "freightCoverageHt" = 0 AND "otherCoverageHt" = 0
      AND ("vatAmount" = 0 OR ("supplierRecoverableRate" IS NOT NULL AND ("supplierVatEntryId" IS NOT NULL OR "isCancelled")))));
ALTER TABLE "financial_credits" ADD CONSTRAINT "financial_credits_amounts_check" CHECK (
  "totalHt" >= 0 AND "vatAmount" >= 0 AND "totalHt" + "vatAmount" > 0 AND "freightCoverageHt" >= 0 AND "otherCoverageHt" >= 0
  AND "freightCoverageHt" + "otherCoverageHt" <= "totalHt");
ALTER TABLE "financial_credits" ADD CONSTRAINT "financial_credits_rates_check" CHECK (
  ("fxRateToReporting" IS NULL OR "fxRateToReporting" > 0) AND
  ("supplierRecoverableRate" IS NULL OR "supplierRecoverableRate" BETWEEN 0 AND 1));
ALTER TABLE "financial_credit_allocations" ADD CONSTRAINT "financial_credit_allocations_amounts_check" CHECK (
  "amountHt" > 0 AND "freightCoverageHt" >= 0 AND "otherCoverageHt" >= 0 AND "freightCoverageHt" + "otherCoverageHt" <= "amountHt");
ALTER TABLE "financial_credit_refunds" ADD CONSTRAINT "financial_credit_refunds_amount_check" CHECK (
  "amount" > 0 AND ("fxRateToReporting" IS NULL OR "fxRateToReporting" > 0));

-- Existing cash matching now also recognizes actual credit refunds, never credit notes.
ALTER TABLE "bank_reconciliation_matches" DROP CONSTRAINT "bank_reconciliation_matches_cashKind_check";
ALTER TABLE "bank_reconciliation_matches" ADD CONSTRAINT "bank_reconciliation_matches_cashKind_check"
  CHECK ("cashKind" IN ('SUPPLIER_PAYMENT', 'CLIENT_RECEIPT', 'FREIGHT_PAYMENT', 'CREDIT_REFUND'));
