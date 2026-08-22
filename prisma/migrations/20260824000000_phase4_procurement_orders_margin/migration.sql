CREATE TYPE "PricingMode" AS ENUM ('SELLING_PRICE', 'TARGET_MARGIN');

ALTER TABLE "procurement_orders"
    ADD COLUMN "description" TEXT,
    ADD COLUMN "category" VARCHAR(80),
    ADD COLUMN "supplierQuoteReference" VARCHAR(120),
    ADD COLUMN "supplierOrderConfirmationReference" VARCHAR(120),
    ADD COLUMN "pricingMode" "PricingMode" NOT NULL DEFAULT 'SELLING_PRICE',
    ADD COLUMN "pricingSourceState" "FinancialState" NOT NULL DEFAULT 'COMMITTED',
    ADD COLUMN "sellingPriceAmount" DECIMAL(19,4),
    ADD COLUMN "sellingCurrencyCode" CHAR(3),
    ADD COLUMN "freightResaleAmount" DECIMAL(19,4),
    ADD COLUMN "targetMarginRate" DECIMAL(9,6);

-- Preserve any scaffolded selling price by selecting one commercial value per
-- order. COMMITTED is preferred, followed by BUDGET and ACTUAL.
WITH commercial AS (
    SELECT DISTINCT ON (financials."orderId")
        financials."orderId",
        financials."sellingPriceOriginalAmount",
        financials."sellingPriceOriginalCurrencyCode"
    FROM "procurement_order_financials" AS financials
    WHERE financials."sellingPriceOriginalAmount" IS NOT NULL
    ORDER BY financials."orderId", CASE financials."state"
        WHEN 'COMMITTED' THEN 1
        WHEN 'BUDGET' THEN 2
        WHEN 'ACTUAL' THEN 3
    END
)
UPDATE "procurement_orders" AS orders
SET
    "sellingPriceAmount" = commercial."sellingPriceOriginalAmount",
    "sellingCurrencyCode" = COALESCE(commercial."sellingPriceOriginalCurrencyCode", orders."orderCurrencyCode")
FROM commercial
WHERE commercial."orderId" = orders."id";

WITH target_pricing AS (
    SELECT DISTINCT ON (financials."orderId")
        financials."orderId",
        financials."state",
        financials."targetMarginRate"
    FROM "procurement_order_financials" AS financials
    WHERE financials."targetMarginRate" IS NOT NULL
    ORDER BY financials."orderId", CASE financials."state"
        WHEN 'COMMITTED' THEN 1
        WHEN 'BUDGET' THEN 2
        WHEN 'ACTUAL' THEN 3
    END
)
UPDATE "procurement_orders" AS orders
SET
    "pricingMode" = 'TARGET_MARGIN',
    "pricingSourceState" = target_pricing."state",
    "targetMarginRate" = target_pricing."targetMarginRate"
FROM target_pricing
WHERE target_pricing."orderId" = orders."id"
  AND orders."sellingPriceAmount" IS NULL;

UPDATE "procurement_orders"
SET "sellingCurrencyCode" = "orderCurrencyCode"
WHERE "sellingCurrencyCode" IS NULL;

ALTER TABLE "procurement_order_financials"
    DROP CONSTRAINT IF EXISTS "procurement_order_financials_sellingPriceOriginalCurrencyC_fkey",
    DROP CONSTRAINT IF EXISTS "procurement_order_financials_sellingPriceReportingCurrency_fkey",
    DROP CONSTRAINT IF EXISTS "order_financials_target_margin_check",
    DROP CONSTRAINT IF EXISTS "order_financials_selling_price_check",
    DROP CONSTRAINT IF EXISTS "order_financials_reporting_price_check",
    DROP CONSTRAINT IF EXISTS "order_financials_fx_rate_check",
    DROP CONSTRAINT IF EXISTS "order_financials_original_currency_pair_check",
    DROP COLUMN "targetMarginRate",
    DROP COLUMN "sellingPriceOriginalAmount",
    DROP COLUMN "sellingPriceOriginalCurrencyCode",
    DROP COLUMN "sellingPriceFxRate",
    DROP COLUMN "sellingPriceReportingAmount",
    DROP COLUMN "sellingPriceReportingCurrencyCode";

ALTER TABLE "procurement_orders"
    ALTER COLUMN "sellingCurrencyCode" SET NOT NULL,
    ADD CONSTRAINT "procurement_orders_selling_price_check" CHECK (
        "sellingPriceAmount" IS NULL OR "sellingPriceAmount" >= 0
    ),
    ADD CONSTRAINT "procurement_orders_freight_resale_check" CHECK (
        "freightResaleAmount" IS NULL OR "freightResaleAmount" >= 0
    ),
    ADD CONSTRAINT "procurement_orders_target_margin_check" CHECK (
        "targetMarginRate" IS NULL OR
        ("targetMarginRate" >= 0 AND "targetMarginRate" < 1)
    ),
    ADD CONSTRAINT "procurement_orders_pricing_mode_check" CHECK (
        ("pricingMode" = 'SELLING_PRICE' AND "targetMarginRate" IS NULL) OR
        ("pricingMode" = 'TARGET_MARGIN' AND "sellingPriceAmount" IS NULL)
    );

ALTER TABLE "procurement_orders"
    ADD CONSTRAINT "procurement_orders_sellingCurrencyCode_fkey"
    FOREIGN KEY ("sellingCurrencyCode") REFERENCES "currencies"("code")
    ON DELETE RESTRICT ON UPDATE CASCADE;
