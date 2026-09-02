ALTER TYPE "PricingMode" ADD VALUE 'COMPONENT_MARKUP';

ALTER TABLE "projects"
  ADD COLUMN "defaultProductMarkupRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
  ADD COLUMN "defaultFreightMarkupRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
  ADD COLUMN "defaultOtherCostMarkupRate" DECIMAL(9,6) NOT NULL DEFAULT 0;

-- Phase 11's single Project markup applied to the aggregate of estimated
-- purchase and freight cost. Copying that rate to each component preserves the
-- same expected total while moving planning to explicit component defaults.
UPDATE "projects"
SET
  "defaultProductMarkupRate" = COALESCE("targetMarkupRate", 0),
  "defaultFreightMarkupRate" = COALESCE("targetMarkupRate", 0),
  "defaultOtherCostMarkupRate" = COALESCE("targetMarkupRate", 0)
WHERE "targetMode" = 'MARKUP';

-- An EXPECTED_SELL Project has one unambiguous aggregate implied markup when
-- both estimated cost and sell are present. Applying that same rate to Product
-- and Freight preserves its stored expected total without inventing a split.
UPDATE "projects"
SET
  "defaultProductMarkupRate" = "expectedSellHt" /
    (COALESCE("estimatedPurchaseCostHt", 0) + COALESCE("estimatedFreightCostHt", 0)) - 1,
  "defaultFreightMarkupRate" = "expectedSellHt" /
    (COALESCE("estimatedPurchaseCostHt", 0) + COALESCE("estimatedFreightCostHt", 0)) - 1,
  "defaultOtherCostMarkupRate" = "expectedSellHt" /
    (COALESCE("estimatedPurchaseCostHt", 0) + COALESCE("estimatedFreightCostHt", 0)) - 1,
  "targetMode" = 'MARKUP'
WHERE "targetMode" = 'EXPECTED_SELL'
  AND "expectedSellHt" IS NOT NULL
  AND "expectedSellHt" >=
    (COALESCE("estimatedPurchaseCostHt", 0) + COALESCE("estimatedFreightCostHt", 0))
  AND (COALESCE("estimatedPurchaseCostHt", 0) + COALESCE("estimatedFreightCostHt", 0)) > 0
  AND "expectedSellHt" /
    (COALESCE("estimatedPurchaseCostHt", 0) + COALESCE("estimatedFreightCostHt", 0)) - 1 <= 999.999999;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_default_markups_non_negative_check" CHECK (
    "defaultProductMarkupRate" >= 0 AND
    "defaultFreightMarkupRate" >= 0 AND
    "defaultOtherCostMarkupRate" >= 0
  );

ALTER TABLE "procurement_orders"
  ADD COLUMN "productMarkupOverrideRate" DECIMAL(9,6),
  ADD COLUMN "freightMarkupOverrideRate" DECIMAL(9,6),
  ADD COLUMN "otherCostMarkupOverrideRate" DECIMAL(9,6),
  ADD CONSTRAINT "procurement_orders_markup_overrides_non_negative_check" CHECK (
    ("productMarkupOverrideRate" IS NULL OR "productMarkupOverrideRate" >= 0) AND
    ("freightMarkupOverrideRate" IS NULL OR "freightMarkupOverrideRate" >= 0) AND
    ("otherCostMarkupOverrideRate" IS NULL OR "otherCostMarkupOverrideRate" >= 0)
  );

-- Existing Orders deliberately keep SELLING_PRICE or TARGET_MARGIN. Their
-- stored selling outcome is therefore unchanged and does not inherit defaults.
