-- Align the Phase 5 constraint with treatment-dependent recoverability.
-- Preserve historical non-null classifications; do not rewrite financial data.
-- The existing rate-range and status/rate synchronization checks remain intact.
BEGIN;

ALTER TABLE "procurement_order_vat_entries"
    DROP CONSTRAINT "order_vat_entries_recoverability_check",
    ADD CONSTRAINT "order_vat_entries_recoverability_check" CHECK (
        ("direction" = 'INPUT' AND (
            "recoverability" IS NOT NULL OR
            "treatment"::text NOT IN (
                'DOMESTIC', 'INTRA_EU_ACQUISITION', 'REVERSE_CHARGE', 'IMPORT', 'CUSTOM'
            )
        )) OR
        ("direction" = 'OUTPUT' AND "recoverability" IS NULL)
    );

COMMIT;
