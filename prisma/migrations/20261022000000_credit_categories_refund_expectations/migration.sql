-- Reviewed Supplier category credits and optional expected refund timing.
-- Prepared only. No historical dates, FX rates, financial amounts or cash are inferred.
ALTER TABLE "financial_credits"
  ADD COLUMN "expectedRefundDate" DATE,
  ADD COLUMN "expectedRefundFxRateToReporting" DECIMAL(20,10);

ALTER TABLE "financial_credits" DROP CONSTRAINT "financial_credits_source_check";
ALTER TABLE "financial_credits" ADD CONSTRAINT "financial_credits_source_check" CHECK (
  ("side" = 'CLIENT' AND "billingDocumentId" IS NOT NULL AND "orderId" IS NULL AND "supplierVatEntryId" IS NULL AND "supplierRecoverableRate" IS NULL)
  OR ("side" = 'SUPPLIER' AND "orderId" IS NOT NULL AND "billingDocumentId" IS NULL
      AND ("vatAmount" = 0 OR ("supplierRecoverableRate" IS NOT NULL AND ("supplierVatEntryId" IS NOT NULL OR "isCancelled")))));

ALTER TABLE "financial_credits" ADD CONSTRAINT "financial_credits_expected_refund_fx_check"
  CHECK ("expectedRefundFxRateToReporting" IS NULL OR "expectedRefundFxRateToReporting" > 0);

CREATE INDEX "financial_credits_isCancelled_expectedRefundDate_idx"
  ON "financial_credits"("isCancelled", "expectedRefundDate");
