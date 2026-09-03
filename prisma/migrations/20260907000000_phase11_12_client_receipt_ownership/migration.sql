-- Phase 11.12 makes the Billing Event the authoritative owner of actual Client cash receipts.
-- The installment link is retained as optional schedule attribution.
ALTER TABLE "client_receipts"
ADD COLUMN "billingDocumentId" UUID;

UPDATE "client_receipts" AS receipt
SET "billingDocumentId" = installment."billingDocumentId"
FROM "client_payment_installments" AS installment
WHERE receipt."installmentId" = installment."id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "client_receipts"
    WHERE "billingDocumentId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Phase 11.12 cannot backfill ClientReceipt billing ownership: orphan receipt found';
  END IF;
END $$;

ALTER TABLE "client_receipts"
ALTER COLUMN "billingDocumentId" SET NOT NULL,
ALTER COLUMN "installmentId" DROP NOT NULL;

ALTER TABLE "client_receipts"
ADD CONSTRAINT "client_receipts_billingDocumentId_fkey"
FOREIGN KEY ("billingDocumentId") REFERENCES "client_billing_documents"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "client_receipts_billingDocumentId_receivedAt_idx"
ON "client_receipts"("billingDocumentId", "receivedAt");
