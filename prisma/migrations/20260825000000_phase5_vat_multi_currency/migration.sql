CREATE TYPE "VatRecoverability" AS ENUM ('RECOVERABLE', 'NON_RECOVERABLE');

ALTER TABLE "procurement_order_financials"
    ADD COLUMN "sellingFxRateToReporting" DECIMAL(20,10),
    ADD CONSTRAINT "order_financials_selling_fx_rate_check" CHECK (
        "sellingFxRateToReporting" IS NULL OR "sellingFxRateToReporting" > 0
    );

ALTER TABLE "procurement_order_vat_entries"
    ADD COLUMN "recoverability" "VatRecoverability",
    ADD COLUMN "isAmountOverride" BOOLEAN NOT NULL DEFAULT false;

-- VAT entries created by the pre-Phase 5 scaffold were excluded from landed
-- cost. Preserve that behavior by classifying prior input VAT as recoverable.
UPDATE "procurement_order_vat_entries"
SET "recoverability" = 'RECOVERABLE'
WHERE "direction" = 'INPUT' AND "recoverability" IS NULL;

ALTER TABLE "procurement_order_vat_entries"
    DROP CONSTRAINT IF EXISTS "order_vat_entries_rate_check",
    ADD CONSTRAINT "order_vat_entries_rate_check" CHECK (
        "vatRate" IS NULL OR ("vatRate" >= 0 AND "vatRate" <= 1)
    ),
    ADD CONSTRAINT "order_vat_entries_amount_check" CHECK (
        "taxableBaseAmount" >= 0 AND "vatAmount" >= 0 AND
        ("reportingTaxableBase" IS NULL OR "reportingTaxableBase" >= 0) AND
        ("reportingVatAmount" IS NULL OR "reportingVatAmount" >= 0)
    ),
    ADD CONSTRAINT "order_vat_entries_recoverability_check" CHECK (
        ("direction" = 'INPUT' AND "recoverability" IS NOT NULL) OR
        ("direction" = 'OUTPUT' AND "recoverability" IS NULL)
    );
