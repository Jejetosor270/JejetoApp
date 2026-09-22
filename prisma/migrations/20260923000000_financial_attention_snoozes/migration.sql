CREATE TABLE "financial_attention_snoozes" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "issueKey" VARCHAR(120) NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "until" DATE NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "financial_attention_snoozes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "financial_attention_snoozes_reason_check" CHECK (length(btrim("reason")) > 0),
    CONSTRAINT "financial_attention_snoozes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "financial_attention_snoozes_userId_issueKey_key" ON "financial_attention_snoozes"("userId", "issueKey");
CREATE INDEX "financial_attention_snoozes_userId_until_idx" ON "financial_attention_snoozes"("userId", "until");
