ALTER TABLE "procurement_orders"
ADD COLUMN "carrierCode" VARCHAR(40),
ADD COLUMN "carrierOtherName" VARCHAR(160),
ADD COLUMN "trackingReference" VARCHAR(200),
ADD COLUMN "budgetPurchaseAmountHt" DECIMAL(19,4),
ADD CONSTRAINT "procurement_orders_budget_nonnegative" CHECK ("budgetPurchaseAmountHt" >= 0);
