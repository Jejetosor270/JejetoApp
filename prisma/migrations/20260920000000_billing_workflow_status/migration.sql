ALTER TABLE "client_billing_documents" ADD COLUMN "workflowStatus" VARCHAR(24) NOT NULL DEFAULT 'INVOICED';
UPDATE "client_billing_documents" SET "workflowStatus" = CASE
  WHEN "isCancelled" THEN 'CANCELLED'
  WHEN "documentType" = 'QUOTE' THEN 'TO_BE_INVOICED'
  WHEN "paymentStatusOverride" = 'OVERDUE' THEN 'OVERDUE'
  ELSE 'INVOICED'
END;
ALTER TABLE "client_billing_documents" ADD CONSTRAINT "client_billing_workflow_status_check"
CHECK ("workflowStatus" IN ('DRAFT', 'TO_BE_INVOICED', 'INVOICED', 'OVERDUE', 'CANCELLED'));
