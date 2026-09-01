ALTER TABLE "items"
ADD COLUMN "budgetPurchaseUnitPriceHt" DECIMAL(19,4),
ADD COLUMN "budgetPurchaseTotalPriceHt" DECIMAL(19,4),
ADD COLUMN "budgetVarianceComment" VARCHAR(500);

UPDATE "items"
SET
  "budgetPurchaseUnitPriceHt" = "unitPurchasePriceHt",
  "budgetPurchaseTotalPriceHt" = "totalPurchasePriceHt"
WHERE "sourceType" = 'BUDGET_XLSX';
