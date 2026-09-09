CREATE TABLE "unassigned_cash_records" (
 "id" UUID PRIMARY KEY,
 "direction" "PaymentDirection" NOT NULL,
 "amount" DECIMAL(19,4) NOT NULL,
 "currencyCode" CHAR(3) NOT NULL REFERENCES currencies(code) ON DELETE RESTRICT,
 "reportingCurrencyCode" CHAR(3) NOT NULL REFERENCES currencies(code) ON DELETE RESTRICT,
 "fxRateToReporting" DECIMAL(20,10),
 "cashDate" DATE NOT NULL,
 "reference" VARCHAR(120),
 "notes" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 "createdById" UUID,
 "updatedById" UUID,
 "unassignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "trashedAt" TIMESTAMP(3)
);
CREATE INDEX "unassigned_cash_records_trashedAt_cashDate_idx" ON "unassigned_cash_records"("trashedAt", "cashDate");
CREATE INDEX "unassigned_cash_records_currencyCode_idx" ON "unassigned_cash_records"("currencyCode");
CREATE INDEX "unassigned_cash_records_reportingCurrencyCode_idx" ON "unassigned_cash_records"("reportingCurrencyCode");
