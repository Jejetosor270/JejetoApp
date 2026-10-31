-- Existing credentials remain read-only. Cash access requires a separate key pair.
CREATE TYPE "ErpConnectionScope" AS ENUM ('READ_ONLY', 'CASH_WRITE');
ALTER TABLE "erp_connection_tokens"
    ADD COLUMN "scope" "ErpConnectionScope" NOT NULL DEFAULT 'READ_ONLY',
    ADD COLUMN "approvalPublicKey" VARCHAR(200);
ALTER TABLE "erp_connection_tokens" ADD CONSTRAINT "erp_connection_tokens_scope_key_check"
    CHECK (("scope" = 'READ_ONLY' AND "approvalPublicKey" IS NULL)
        OR ("scope" = 'CASH_WRITE' AND "approvalPublicKey" IS NOT NULL));

DROP INDEX "erp_connection_tokens_active_user_key";
CREATE UNIQUE INDEX "erp_connection_tokens_active_user_scope_key"
    ON "erp_connection_tokens"("userId", "scope")
    WHERE "revokedAt" IS NULL AND "userId" IS NOT NULL;

-- Durable reviewed commands. These audit-style IDs deliberately have no cascading source links.
CREATE TABLE "erp_cash_change_proposals" (
 "id" UUID PRIMARY KEY,
 "actorId" UUID NOT NULL, "tokenId" UUID NOT NULL,
 "action" VARCHAR(40) NOT NULL CHECK ("action" IN ('RECORD_SUPPLIER_PAYMENT','RECORD_CLIENT_RECEIPT','UPDATE_SUPPLIER_PAYMENT','UPDATE_CLIENT_RECEIPT','CANCEL_SUPPLIER_PAYMENT','CANCEL_CLIENT_RECEIPT')),
 "targetId" UUID NOT NULL, "documentId" UUID NOT NULL, "installmentId" UUID,
 "projectId" UUID NOT NULL, "projectName" VARCHAR(200) NOT NULL,
 "partyName" VARCHAR(200) NOT NULL, "recordReference" VARCHAR(200) NOT NULL, "termLabel" VARCHAR(200),
 "amount" DECIMAL(19,4) NOT NULL CHECK ("amount" > 0),
 "currencyCode" CHAR(3) NOT NULL, "reportingCurrencyCode" CHAR(3) NOT NULL,
 "cashDate" DATE NOT NULL, "fxRate" DECIMAL(20,10) CHECK ("fxRate" > 0),
 "reference" VARCHAR(120), "notes" TEXT, "reason" VARCHAR(500),
 "previousAmount" DECIMAL(19,4), "previousDate" DATE, "previousFxRate" DECIMAL(20,10),
 "previousReference" VARCHAR(120), "previousNotes" TEXT,
 "remainingBefore" DECIMAL(19,4) NOT NULL, "remainingAfter" DECIMAL(19,4) NOT NULL,
 "stateHash" CHAR(64) NOT NULL, "digest" CHAR(64) NOT NULL, "nonce" UUID NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "approvedAt" TIMESTAMP(3), "approvalSignature" VARCHAR(86), "executedAt" TIMESTAMP(3), "resultId" UUID,
 CONSTRAINT "erp_cash_proposal_expiry" CHECK ("expiresAt" > "createdAt"),
 CONSTRAINT "erp_cash_proposal_execution" CHECK (
   ("executedAt" IS NULL AND "resultId" IS NULL AND "approvedAt" IS NULL AND "approvalSignature" IS NULL) OR
   ("executedAt" IS NOT NULL AND "resultId" IS NOT NULL AND "approvedAt" IS NOT NULL AND "approvalSignature" IS NOT NULL)
 )
);
CREATE INDEX "erp_cash_change_proposals_actorId_createdAt_idx" ON "erp_cash_change_proposals" ("actorId", "createdAt");
CREATE INDEX "erp_cash_change_proposals_tokenId_expiresAt_idx" ON "erp_cash_change_proposals" ("tokenId", "expiresAt");
