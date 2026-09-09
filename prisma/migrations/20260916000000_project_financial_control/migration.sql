-- Preserve existing HT totals: existing non-freight revenue remains merchandise until reviewed.
ALTER TABLE "client_billing_documents" ADD COLUMN "otherCoverageHt" DECIMAL(19,4) NOT NULL DEFAULT 0;
ALTER TABLE "client_billing_allocations" ADD COLUMN "otherCoverageHt" DECIMAL(19,4) NOT NULL DEFAULT 0;
ALTER TABLE "project_freight_expenses" ADD COLUMN "dueDate" DATE;
CREATE TABLE "freight_expense_payments" (
  "id" UUID NOT NULL,
  "expenseId" UUID NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "paidAt" DATE NOT NULL,
  "fxRateToReporting" DECIMAL(20,10),
  "reference" VARCHAR(120),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" UUID,
  "updatedById" UUID,
  "trashedAt" TIMESTAMP(3),
  CONSTRAINT "freight_expense_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "freight_payment_positive" CHECK ("amount" > 0),
  CONSTRAINT "freight_payment_fx_positive" CHECK ("fxRateToReporting" IS NULL OR "fxRateToReporting" > 0),
  CONSTRAINT "freight_expense_payments_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "project_freight_expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "freight_expense_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "freight_expense_payments_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "freight_expense_payments_expenseId_paidAt_idx" ON "freight_expense_payments"("expenseId", "paidAt");
CREATE INDEX "freight_expense_payments_trashedAt_idx" ON "freight_expense_payments"("trashedAt");
