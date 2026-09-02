ALTER TABLE "procurement_orders"
ADD COLUMN "freightAllowanceOverrideAmount" DECIMAL(19,4);

CREATE TABLE "project_freight_expenses" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "supplierId" UUID,
    "reference" VARCHAR(120),
    "description" VARCHAR(200) NOT NULL,
    "expenseDate" DATE NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "fxRateToReporting" DECIMAL(20,10),
    "costAmountHt" DECIMAL(19,4) NOT NULL,
    "freightMarkupOverrideRate" DECIMAL(9,6),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,
    CONSTRAINT "project_freight_expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_freight_expenses_projectId_expenseDate_idx"
ON "project_freight_expenses"("projectId", "expenseDate");
CREATE INDEX "project_freight_expenses_supplierId_idx"
ON "project_freight_expenses"("supplierId");
CREATE INDEX "project_freight_expenses_currencyCode_idx"
ON "project_freight_expenses"("currencyCode");

ALTER TABLE "project_freight_expenses"
ADD CONSTRAINT "project_freight_expenses_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_freight_expenses"
ADD CONSTRAINT "project_freight_expenses_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_freight_expenses"
ADD CONSTRAINT "project_freight_expenses_currencyCode_fkey"
FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_freight_expenses"
ADD CONSTRAINT "project_freight_expenses_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_freight_expenses"
ADD CONSTRAINT "project_freight_expenses_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
