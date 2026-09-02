ALTER TYPE "PricingMode" ADD VALUE 'PROJECT_MARKUP';
ALTER TYPE "PricingMode" ADD VALUE 'ORDER_MARKUP';
ALTER TYPE "PricingMode" ADD VALUE 'DIRECT_SELLING_PRICE';

ALTER TABLE "procurement_orders"
  ADD COLUMN "outputVatTaxableBaseOverride" DECIMAL(19,4),
  ALTER COLUMN "pricingMode" SET DEFAULT 'PROJECT_MARKUP';

ALTER TABLE "procurement_orders"
  ADD CONSTRAINT "procurement_orders_output_vat_base_override_non_negative_check"
  CHECK (
    "outputVatTaxableBaseOverride" IS NULL OR
    "outputVatTaxableBaseOverride" >= 0
  );

-- Existing VAT bases were employee-entered. Preserve them as explicit manual
-- overrides so this migration never changes a historical VAT amount.
UPDATE "procurement_orders" AS orders
SET "outputVatTaxableBaseOverride" = vat."taxableBaseAmount"
FROM "procurement_order_vat_entries" AS vat
WHERE vat."orderId" = orders."id"
  AND vat."direction" = 'OUTPUT';

-- A Phase 11.1 component Order with any explicit override becomes an
-- ORDER_MARKUP Order. Freeze every component at its currently effective rate
-- so later Project-default changes cannot reprice it.
UPDATE "procurement_orders" AS orders
SET
  "productMarkupOverrideRate" = COALESCE(
    orders."productMarkupOverrideRate",
    projects."defaultProductMarkupRate"
  ),
  "freightMarkupOverrideRate" = COALESCE(
    orders."freightMarkupOverrideRate",
    projects."defaultFreightMarkupRate"
  ),
  "otherCostMarkupOverrideRate" = COALESCE(
    orders."otherCostMarkupOverrideRate",
    projects."defaultOtherCostMarkupRate"
  ),
  "pricingMode" = 'ORDER_MARKUP'
FROM "projects" AS projects
WHERE orders."projectId" = projects."id"
  AND orders."pricingMode" = 'COMPONENT_MARKUP'
  AND (
    orders."productMarkupOverrideRate" IS NOT NULL OR
    orders."freightMarkupOverrideRate" IS NOT NULL OR
    orders."otherCostMarkupOverrideRate" IS NOT NULL
  );

-- Pure inheritance already had PROJECT_MARKUP semantics.
UPDATE "procurement_orders"
SET "pricingMode" = 'PROJECT_MARKUP'
WHERE "pricingMode" = 'COMPONENT_MARKUP';

-- Stored package selling-price Orders map directly. Legacy target-margin
-- Orders also map to direct pricing but retain targetMarginRate temporarily;
-- the application continues deriving their historical selling outcome until
-- the first explicit edit stores that outcome as a direct selling price.
UPDATE "procurement_orders"
SET "pricingMode" = 'DIRECT_SELLING_PRICE'
WHERE "pricingMode" IN ('SELLING_PRICE', 'TARGET_MARGIN');

ALTER TABLE "procurement_orders"
  ADD CONSTRAINT "procurement_orders_explicit_pricing_method_check"
  CHECK (
    "pricingMode" IN (
      'PROJECT_MARKUP',
      'ORDER_MARKUP',
      'DIRECT_SELLING_PRICE'
    )
  );
