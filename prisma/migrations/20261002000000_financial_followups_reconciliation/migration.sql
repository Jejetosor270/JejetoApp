-- Coordination and reconciliation evidence only; existing cash remains authoritative.
-- Prepare for controlled deployment. No historical balances or schedules are rewritten.
CREATE TABLE "financial_follow_ups" (
  "id" UUID NOT NULL,
  "issueKey" VARCHAR(120) NOT NULL,
  "assigneeId" UUID,
  "nextFollowUpDate" DATE,
  "note" VARCHAR(1000) NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" UUID,
  "updatedById" UUID,
  CONSTRAINT "financial_follow_ups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_follow_ups_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "financial_follow_ups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "financial_follow_ups_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "financial_follow_ups_issueKey_key" ON "financial_follow_ups"("issueKey");
CREATE INDEX "financial_follow_ups_assigneeId_nextFollowUpDate_idx" ON "financial_follow_ups"("assigneeId", "nextFollowUpDate");
CREATE INDEX "financial_follow_ups_createdById_idx" ON "financial_follow_ups"("createdById");
CREATE INDEX "financial_follow_ups_updatedById_idx" ON "financial_follow_ups"("updatedById");

CREATE TABLE "bank_statement_imports" (
  "id" UUID NOT NULL,
  "accountLabel" VARCHAR(120) NOT NULL,
  "accountKey" VARCHAR(120) NOT NULL,
  "currencyCode" CHAR(3) NOT NULL,
  "fingerprint" CHAR(64) NOT NULL CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" UUID,
  CONSTRAINT "bank_statement_imports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bank_statement_imports_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bank_statement_imports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "bank_statement_imports_accountKey_currencyCode_fingerprint_key" ON "bank_statement_imports"("accountKey", "currencyCode", "fingerprint");
CREATE INDEX "bank_statement_imports_currencyCode_idx" ON "bank_statement_imports"("currencyCode");
CREATE INDEX "bank_statement_imports_createdById_idx" ON "bank_statement_imports"("createdById");

CREATE TABLE "bank_statement_lines" (
  "id" UUID NOT NULL,
  "importId" UUID NOT NULL,
  "rowNumber" INTEGER NOT NULL CHECK ("rowNumber" > 0),
  "bookedAt" DATE NOT NULL,
  "direction" "PaymentDirection" NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL CHECK ("amount" > 0),
  "reference" VARCHAR(240),
  "description" VARCHAR(500),
  "bankTransactionId" VARCHAR(240),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bank_statement_lines_importId_fkey" FOREIGN KEY ("importId") REFERENCES "bank_statement_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "bank_statement_lines_importId_rowNumber_key" ON "bank_statement_lines"("importId", "rowNumber");
CREATE INDEX "bank_statement_lines_bookedAt_idx" ON "bank_statement_lines"("bookedAt");

CREATE TABLE "bank_reconciliation_matches" (
  "id" UUID NOT NULL,
  "lineId" UUID NOT NULL,
  "cashKind" VARCHAR(30) NOT NULL CHECK ("cashKind" IN ('SUPPLIER_PAYMENT', 'CLIENT_RECEIPT', 'FREIGHT_PAYMENT')),
  "cashRecordId" UUID NOT NULL,
  "cashFingerprint" CHAR(64) NOT NULL CHECK ("cashFingerprint" ~ '^[0-9a-f]{64}$'),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" UUID,
  CONSTRAINT "bank_reconciliation_matches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bank_reconciliation_matches_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "bank_statement_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bank_reconciliation_matches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "bank_reconciliation_matches_cashKind_cashRecordId_key" ON "bank_reconciliation_matches"("cashKind", "cashRecordId");
CREATE INDEX "bank_reconciliation_matches_lineId_idx" ON "bank_reconciliation_matches"("lineId");
CREATE INDEX "bank_reconciliation_matches_createdById_idx" ON "bank_reconciliation_matches"("createdById");
