-- Consolidate the most advanced populated financial state for each order.
-- ACTUAL wins over COMMITTED, which wins over BUDGET. The selected state keeps
-- its original costs, VAT classifications, and FX inputs; older alternatives
-- are intentionally retired with the state-based model.

ALTER TABLE "procurement_orders"
    ADD COLUMN "purchaseFxRateToReporting" DECIMAL(20,10),
    ADD COLUMN "sellingFxRateToReporting" DECIMAL(20,10);

ALTER TABLE "procurement_order_cost_lines"
    ADD COLUMN "orderId" UUID;

ALTER TABLE "procurement_order_vat_entries"
    ADD COLUMN "orderId" UUID;

WITH ranked_financials AS (
    SELECT
        financials."id",
        financials."orderId",
        financials."sellingFxRateToReporting",
        ROW_NUMBER() OVER (
            PARTITION BY financials."orderId"
            ORDER BY CASE financials."state"
                WHEN 'ACTUAL' THEN 1
                WHEN 'COMMITTED' THEN 2
                WHEN 'BUDGET' THEN 3
            END
        ) AS "priority"
    FROM "procurement_order_financials" AS financials
    WHERE EXISTS (
        SELECT 1
        FROM "procurement_order_cost_lines" AS costs
        WHERE costs."financialsId" = financials."id"
    ) OR EXISTS (
        SELECT 1
        FROM "procurement_order_vat_entries" AS vat
        WHERE vat."financialsId" = financials."id"
    )
), selected_financials AS (
    SELECT * FROM ranked_financials WHERE "priority" = 1
)
UPDATE "procurement_orders" AS orders
SET
    "purchaseFxRateToReporting" = CASE
        WHEN orders."orderCurrencyCode" = projects."reportingCurrencyCode" THEN NULL
        ELSE COALESCE(
            (
                SELECT costs."fxRateToReporting"
                FROM "procurement_order_cost_lines" AS costs
                WHERE costs."financialsId" = selected."id"
                ORDER BY costs."createdAt", costs."id"
                LIMIT 1
            ),
            (
                SELECT vat."fxRateToReporting"
                FROM "procurement_order_vat_entries" AS vat
                WHERE vat."financialsId" = selected."id" AND vat."direction" = 'INPUT'
                ORDER BY vat."createdAt", vat."id"
                LIMIT 1
            )
        )
    END,
    "sellingFxRateToReporting" = CASE
        WHEN orders."sellingCurrencyCode" = projects."reportingCurrencyCode" THEN NULL
        ELSE COALESCE(
            selected."sellingFxRateToReporting",
            (
                SELECT vat."fxRateToReporting"
                FROM "procurement_order_vat_entries" AS vat
                WHERE vat."financialsId" = selected."id" AND vat."direction" = 'OUTPUT'
                ORDER BY vat."createdAt", vat."id"
                LIMIT 1
            )
        )
    END
FROM selected_financials AS selected, "projects"
WHERE selected."orderId" = orders."id"
  AND projects."id" = orders."projectId";

WITH ranked_financials AS (
    SELECT financials."id", financials."orderId",
        ROW_NUMBER() OVER (
            PARTITION BY financials."orderId"
            ORDER BY CASE financials."state"
                WHEN 'ACTUAL' THEN 1 WHEN 'COMMITTED' THEN 2 WHEN 'BUDGET' THEN 3
            END
        ) AS "priority"
    FROM "procurement_order_financials" AS financials
    WHERE EXISTS (SELECT 1 FROM "procurement_order_cost_lines" AS costs WHERE costs."financialsId" = financials."id")
       OR EXISTS (SELECT 1 FROM "procurement_order_vat_entries" AS vat WHERE vat."financialsId" = financials."id")
)
UPDATE "procurement_order_cost_lines" AS costs
SET "orderId" = selected."orderId"
FROM ranked_financials AS selected
WHERE selected."priority" = 1 AND costs."financialsId" = selected."id";

WITH ranked_financials AS (
    SELECT financials."id", financials."orderId",
        ROW_NUMBER() OVER (
            PARTITION BY financials."orderId"
            ORDER BY CASE financials."state"
                WHEN 'ACTUAL' THEN 1 WHEN 'COMMITTED' THEN 2 WHEN 'BUDGET' THEN 3
            END
        ) AS "priority"
    FROM "procurement_order_financials" AS financials
    WHERE EXISTS (SELECT 1 FROM "procurement_order_cost_lines" AS costs WHERE costs."financialsId" = financials."id")
       OR EXISTS (SELECT 1 FROM "procurement_order_vat_entries" AS vat WHERE vat."financialsId" = financials."id")
)
UPDATE "procurement_order_vat_entries" AS vat
SET "orderId" = selected."orderId"
FROM ranked_financials AS selected
WHERE selected."priority" = 1 AND vat."financialsId" = selected."id";

-- Older state alternatives are intentionally removed after the selected state
-- has been copied to the order-level single-cost model.
DELETE FROM "procurement_order_cost_lines" WHERE "orderId" IS NULL;
DELETE FROM "procurement_order_vat_entries" WHERE "orderId" IS NULL;

-- The former data model permitted several lines in a category. Consolidate
-- them so each current order has one value for each cost component.
WITH ranked_costs AS (
    SELECT
        "id",
        SUM("originalAmount") OVER (
            PARTITION BY "orderId", "category"
        ) AS "totalAmount",
        ROW_NUMBER() OVER (
            PARTITION BY "orderId", "category"
            ORDER BY "createdAt", "id"
        ) AS "position"
    FROM "procurement_order_cost_lines"
)
UPDATE "procurement_order_cost_lines" AS costs
SET "originalAmount" = ranked."totalAmount"
FROM ranked_costs AS ranked
WHERE costs."id" = ranked."id" AND ranked."position" = 1;

WITH ranked_costs AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "orderId", "category"
            ORDER BY "createdAt", "id"
        ) AS "position"
    FROM "procurement_order_cost_lines"
)
DELETE FROM "procurement_order_cost_lines" AS costs
USING ranked_costs AS ranked
WHERE costs."id" = ranked."id" AND ranked."position" > 1;

-- The single purchase value is net of the prior positive discount line.
WITH discounts AS (
    SELECT "orderId", SUM("originalAmount") AS "amount"
    FROM "procurement_order_cost_lines"
    WHERE "category" = 'SUPPLIER_DISCOUNT'
    GROUP BY "orderId"
)
UPDATE "procurement_order_cost_lines" AS purchases
SET "originalAmount" = purchases."originalAmount" - discounts."amount"
FROM discounts
WHERE purchases."orderId" = discounts."orderId"
  AND purchases."category" = 'SUPPLIER_PURCHASE';

DELETE FROM "procurement_order_cost_lines" WHERE "category" = 'SUPPLIER_DISCOUNT';

ALTER TABLE "procurement_order_cost_lines"
    DROP CONSTRAINT IF EXISTS "procurement_order_cost_lines_financialsId_fkey",
    DROP CONSTRAINT IF EXISTS "procurement_order_cost_lines_originalCurrencyCode_fkey",
    DROP CONSTRAINT IF EXISTS "procurement_order_cost_lines_reportingCurrencyCode_fkey",
    DROP CONSTRAINT IF EXISTS "order_cost_lines_reporting_amount_check",
    DROP CONSTRAINT IF EXISTS "order_cost_lines_fx_rate_check",
    DROP COLUMN "financialsId",
    DROP COLUMN "originalCurrencyCode",
    DROP COLUMN "fxRateToReporting",
    DROP COLUMN "reportingAmount",
    DROP COLUMN "reportingCurrencyCode",
    ALTER COLUMN "orderId" SET NOT NULL;

ALTER TABLE "procurement_order_vat_entries"
    DROP CONSTRAINT IF EXISTS "procurement_order_vat_entries_financialsId_fkey",
    DROP CONSTRAINT IF EXISTS "procurement_order_vat_entries_originalCurrencyCode_fkey",
    DROP CONSTRAINT IF EXISTS "procurement_order_vat_entries_reportingCurrencyCode_fkey",
    DROP CONSTRAINT IF EXISTS "order_vat_entries_fx_rate_check",
    DROP CONSTRAINT IF EXISTS "order_vat_entries_amount_check",
    DROP COLUMN "financialsId",
    DROP COLUMN "originalCurrencyCode",
    DROP COLUMN "fxRateToReporting",
    DROP COLUMN "reportingTaxableBase",
    DROP COLUMN "reportingVatAmount",
    DROP COLUMN "reportingCurrencyCode",
    ALTER COLUMN "orderId" SET NOT NULL;

DROP INDEX IF EXISTS "procurement_order_cost_lines_financialsId_category_idx";
DROP INDEX IF EXISTS "procurement_order_vat_entries_financialsId_direction_idx";

ALTER TABLE "procurement_order_cost_lines"
    ADD CONSTRAINT "procurement_order_cost_lines_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "procurement_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "procurement_order_cost_lines_orderId_category_key"
    ON "procurement_order_cost_lines"("orderId", "category");

ALTER TABLE "procurement_order_vat_entries"
    ADD CONSTRAINT "procurement_order_vat_entries_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "procurement_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "procurement_order_vat_entries_orderId_direction_idx"
    ON "procurement_order_vat_entries"("orderId", "direction");

DROP TABLE "procurement_order_financials";

ALTER TABLE "procurement_orders"
    DROP COLUMN "pricingSourceState",
    ADD CONSTRAINT "procurement_orders_purchase_fx_rate_check" CHECK (
        "purchaseFxRateToReporting" IS NULL OR "purchaseFxRateToReporting" > 0
    ),
    ADD CONSTRAINT "procurement_orders_selling_fx_rate_check" CHECK (
        "sellingFxRateToReporting" IS NULL OR "sellingFxRateToReporting" > 0
    );

CREATE TYPE "ProcurementCostCategory_new" AS ENUM (
    'SUPPLIER_PURCHASE', 'FREIGHT', 'CUSTOMS_DUTIES', 'MISCELLANEOUS'
);
ALTER TABLE "procurement_order_cost_lines"
    ALTER COLUMN "category" TYPE "ProcurementCostCategory_new"
    USING "category"::text::"ProcurementCostCategory_new";
DROP TYPE "ProcurementCostCategory";
ALTER TYPE "ProcurementCostCategory_new" RENAME TO "ProcurementCostCategory";

DROP TYPE "FinancialState";
