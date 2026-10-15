-- Payment terms own due dates. Keep document dueDate as historical input only.
-- This migration intentionally fails before changes when a shared term inherited
-- incompatible dates. Review those matches instead of silently choosing a date.
BEGIN;

CREATE TEMP TABLE billing_term_date_backfill ON COMMIT DROP AS
SELECT term.id,
       MIN(document."dueDate") AS "dueDate",
       COUNT(DISTINCT document."dueDate") AS "dateCount",
       md5((to_jsonb(term) - 'updatedAt' - 'updatedById' - 'createdById' - 'trashedAt')::text) AS "previousSignature"
FROM "client_payment_installments" term
JOIN "client_billing_documents" document
  ON document."matchedInstallmentId" = term.id
  OR (document."matchedInstallmentId" IS NULL AND term."billingDocumentId" = document.id)
WHERE term."dueDate" IS NULL AND document."dueDate" IS NOT NULL
GROUP BY term.id;

DO $$
DECLARE conflicts INTEGER;
BEGIN
  SELECT COUNT(*) INTO conflicts FROM billing_term_date_backfill WHERE "dateCount" > 1;
  IF conflicts > 0 THEN
    RAISE EXCEPTION 'Payment date migration stopped: % shared payment terms have conflicting legacy dates. Review the Quote/Invoice matches and set an explicit term due date before retrying.', conflicts;
  END IF;
END $$;

-- Legacy documents without any schedule used their own due date. Represent
-- that same obligation once. Do not recreate intentionally trashed schedules,
-- modify receipt ownership, or change actual payment amounts/dates/FX.
CREATE TEMP TABLE billing_default_term_backfill ON COMMIT DROP AS
SELECT gen_random_uuid() AS "termId", document.*, balance.remaining
FROM "client_billing_documents" document
JOIN LATERAL (
  SELECT COALESCE(SUM(receipt.amount), 0) AS paid
  FROM "client_receipts" receipt
  WHERE receipt."billingDocumentId" = document.id
    AND (receipt."trashedAt" IS NULL OR (
      document."trashedAt" IS NOT NULL AND EXISTS (
        SELECT 1 FROM "trash_records" parent_record
        JOIN "trash_records" cash_record ON cash_record."batchId" = parent_record."batchId"
        JOIN "trash_batches" batch ON batch.id = parent_record."batchId" AND batch."restoredAt" IS NULL
        WHERE parent_record.model = 'ClientBillingDocument' AND parent_record."recordId" = document.id
          AND cash_record.model = 'ClientReceipt' AND cash_record."recordId" = receipt.id
      )
    ))
) cash ON true
JOIN LATERAL (
  SELECT COALESCE(SUM(credit."totalHt" + credit."vatAmount"), 0) AS credited
  FROM "financial_credits" credit
  WHERE credit."billingDocumentId" = document.id AND NOT credit."isCancelled"
) credits ON true
JOIN LATERAL (
  SELECT COALESCE(SUM(refund.amount), 0) AS refunded
  FROM "financial_credit_refunds" refund
  JOIN "financial_credits" credit ON credit.id = refund."creditId"
  WHERE credit."billingDocumentId" = document.id
    AND NOT credit."isCancelled" AND NOT refund."isCancelled"
) refunds ON true
JOIN LATERAL (
  SELECT GREATEST(document."totalTtc" - credits.credited - cash.paid + refunds.refunded, 0) AS remaining
) balance ON true
WHERE document."dueDate" IS NOT NULL
  AND balance.remaining > 0
  AND document."matchedInstallmentId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "client_payment_installments" term WHERE term."billingDocumentId" = document.id
  );

DO $$
DECLARE conflicts INTEGER;
BEGIN
  SELECT COUNT(*) INTO conflicts
  FROM billing_default_term_backfill document
  WHERE document."trashedAt" IS NOT NULL AND (
    SELECT COUNT(*) FROM "trash_records" record
    JOIN "trash_batches" batch ON batch.id = record."batchId"
    WHERE record.model = 'ClientBillingDocument'
      AND record."recordId" = document.id
      AND batch."restoredAt" IS NULL
  ) <> 1;
  IF conflicts > 0 THEN
    RAISE EXCEPTION 'Payment date migration stopped: % trashed Billing documents lack a unique active Trash batch. Review Trash metadata before retrying.', conflicts;
  END IF;
END $$;

UPDATE "client_payment_installments" term
SET "dueDate" = backfill."dueDate"
FROM billing_term_date_backfill backfill
WHERE term.id = backfill.id;

-- Preserve existing restore guards only where the pre-migration signature
-- still matched. Never hide a real change made since the record was trashed.
UPDATE "trash_dependencies" dependency
SET signature = md5((to_jsonb(term) - 'updatedAt' - 'updatedById' - 'createdById' - 'trashedAt')::text)
FROM "client_payment_installments" term
JOIN billing_term_date_backfill backfill ON backfill.id = term.id
WHERE dependency.model = 'ClientPaymentInstallment'
  AND dependency."recordId" = term.id
  AND dependency.signature = backfill."previousSignature";

INSERT INTO "client_payment_installments" (
  id, "billingDocumentId", sequence, label, basis, "percentageRate",
  "scheduledAmount", "currencyCode", "dueDate", "expectedFxRateToReporting",
  "isCancelled", "trashedAt", "createdAt", "updatedAt", "createdById", "updatedById"
)
SELECT "termId", id, 1, 'Remaining balance', 'FIXED_AMOUNT', NULL,
       remaining, "currencyCode", "dueDate", "fxRateToReporting",
       false, "trashedAt", "createdAt", "updatedAt", "createdById", "updatedById"
FROM billing_default_term_backfill;

INSERT INTO "trash_records" (id, "batchId", model, "recordId")
SELECT gen_random_uuid(), record."batchId", 'ClientPaymentInstallment', document."termId"
FROM billing_default_term_backfill document
JOIN "trash_records" record ON record.model = 'ClientBillingDocument' AND record."recordId" = document.id
JOIN "trash_batches" batch ON batch.id = record."batchId" AND batch."restoredAt" IS NULL
WHERE document."trashedAt" IS NOT NULL;

COMMIT;
