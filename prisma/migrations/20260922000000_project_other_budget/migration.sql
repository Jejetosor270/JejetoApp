-- NULL is an unreviewed Other/services budget; zero is an explicit approved zero.
ALTER TABLE "projects" ADD COLUMN "estimatedOtherCostHt" DECIMAL(19,4);
ALTER TABLE "projects" ADD CONSTRAINT "projects_other_budget_nonnegative"
  CHECK ("estimatedOtherCostHt" IS NULL OR "estimatedOtherCostHt" >= 0);
