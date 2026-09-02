ALTER TYPE "PricingMode" ADD VALUE IF NOT EXISTS 'PROJECT_MARKUP';
ALTER TYPE "PricingMode" ADD VALUE IF NOT EXISTS 'ORDER_MARKUP';
ALTER TYPE "PricingMode" ADD VALUE IF NOT EXISTS 'DIRECT_SELLING_PRICE';

-- Phase 4 constrained Orders to the two original pricing modes. Replace that
-- constraint before touching any Order rows. The transition constraint accepts
-- both legacy and Phase 11.2 values while the deterministic backfill runs.
-- The IF EXISTS drops also make this safe after a partially executed attempt.
ALTER TABLE "procurement_orders"
  DROP CONSTRAINT IF EXISTS "procurement_orders_pricing_mode_check",
  DROP CONSTRAINT IF EXISTS "procurement_orders_pricing_mode_transition_check",
  DROP CONSTRAINT IF EXISTS "procurement_orders_explicit_pricing_method_check";

ALTER TABLE "procurement_orders"
  ADD CONSTRAINT "procurement_orders_pricing_mode_transition_check"
  CHECK (
    "pricingMode" IN (
      'PROJECT_MARKUP',
      'ORDER_MARKUP',
      'DIRECT_SELLING_PRICE'
    ) OR
    ("pricingMode" = 'SELLING_PRICE' AND "targetMarginRate" IS NULL) OR
    ("pricingMode" = 'TARGET_MARGIN' AND "sellingPriceAmount" IS NULL) OR
    "pricingMode" = 'COMPONENT_MARKUP'
  );

ALTER TABLE "procurement_orders"
  ADD COLUMN IF NOT EXISTS "outputVatTaxableBaseOverride" DECIMAL(19,4),
  ALTER COLUMN "pricingMode" SET DEFAULT 'PROJECT_MARKUP';

ALTER TABLE "procurement_orders"
  DROP CONSTRAINT IF EXISTS "procurement_orders_output_vat_base_override_non_negative_check";

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

-- Only the three Phase 11.2 methods remain after the backfill. Replace the
-- transition constraint with the final authoritative Order constraint.
ALTER TABLE "procurement_orders"
  DROP CONSTRAINT "procurement_orders_pricing_mode_transition_check";

ALTER TABLE "procurement_orders"
  ADD CONSTRAINT "procurement_orders_pricing_mode_check"
  CHECK (
    "pricingMode" IN (
      'PROJECT_MARKUP',
      'ORDER_MARKUP',
      'DIRECT_SELLING_PRICE'
    )
  );
