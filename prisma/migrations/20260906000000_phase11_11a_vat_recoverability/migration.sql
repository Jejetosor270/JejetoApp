BEGIN;

ALTER TYPE "VatRecoverability" ADD VALUE 'PARTIALLY_RECOVERABLE';

ALTER TABLE "procurement_order_vat_entries"
    ADD COLUMN "recoverableRate" DECIMAL(9,6);

UPDATE "procurement_order_vat_entries"
SET "recoverableRate" = CASE "recoverability"::text
    WHEN 'RECOVERABLE' THEN 1.000000
    WHEN 'NON_RECOVERABLE' THEN 0.000000
    ELSE NULL
END
WHERE "direction" = 'INPUT';

ALTER TABLE "procurement_order_vat_entries"
    ADD CONSTRAINT "order_vat_entries_recoverable_rate_check" CHECK (
        ("direction" = 'OUTPUT' AND "recoverableRate" IS NULL) OR
        ("direction" = 'INPUT' AND "recoverableRate" BETWEEN 0 AND 1)
    ),
    ADD CONSTRAINT "order_vat_entries_recoverability_rate_sync_check" CHECK (
        ("recoverability"::text = 'RECOVERABLE' AND "recoverableRate" = 1) OR
        ("recoverability"::text = 'NON_RECOVERABLE' AND "recoverableRate" = 0) OR
        ("recoverability"::text = 'PARTIALLY_RECOVERABLE' AND "recoverableRate" > 0 AND "recoverableRate" < 1) OR
        ("recoverability" IS NULL AND "recoverableRate" IS NULL)
    );

ALTER TABLE "project_freight_expenses"
    ADD COLUMN "vatTreatment" "VatTreatment",
    ADD COLUMN "vatRate" DECIMAL(9,6),
    ADD COLUMN "vatAmount" DECIMAL(19,4),
    ADD COLUMN "vatAmountIsManual" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "recoverability" "VatRecoverability",
    ADD COLUMN "recoverableRate" DECIMAL(9,6);

ALTER TABLE "project_freight_expenses"
    ADD CONSTRAINT "project_freight_expenses_vat_values_check" CHECK (
        (
            "vatTreatment" IS NULL AND
            "vatRate" IS NULL AND
            "vatAmount" IS NULL AND
            "vatAmountIsManual" = false AND
            "recoverability" IS NULL AND
            "recoverableRate" IS NULL
        ) OR (
            "vatTreatment" IS NOT NULL AND
            "vatAmount" IS NOT NULL AND
            "vatAmount" >= 0 AND
            ("vatRate" IS NULL OR "vatRate" BETWEEN 0 AND 1)
        )
    ),
    ADD CONSTRAINT "project_freight_expenses_recoverability_check" CHECK (
        (
            "vatTreatment"::text IN ('DOMESTIC', 'INTRA_EU_ACQUISITION', 'REVERSE_CHARGE', 'IMPORT', 'CUSTOM') AND
            "recoverability" IS NOT NULL AND
            "recoverableRate" BETWEEN 0 AND 1
        ) OR (
            ("vatTreatment" IS NULL OR "vatTreatment"::text NOT IN ('DOMESTIC', 'INTRA_EU_ACQUISITION', 'REVERSE_CHARGE', 'IMPORT', 'CUSTOM')) AND
            "recoverability" IS NULL AND
            "recoverableRate" IS NULL
        )
    ),
    ADD CONSTRAINT "project_freight_expenses_recoverability_rate_sync_check" CHECK (
        ("recoverability"::text = 'RECOVERABLE' AND "recoverableRate" = 1) OR
        ("recoverability"::text = 'NON_RECOVERABLE' AND "recoverableRate" = 0) OR
        ("recoverability"::text = 'PARTIALLY_RECOVERABLE' AND "recoverableRate" > 0 AND "recoverableRate" < 1) OR
        ("recoverability" IS NULL AND "recoverableRate" IS NULL)
    );

COMMIT;
