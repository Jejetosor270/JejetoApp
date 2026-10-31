-- Read-only external connection credentials. Raw bearer tokens never enter the database.
CREATE TABLE "erp_connection_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "tokenHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "erp_connection_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "erp_connection_tokens_expiry_check" CHECK ("expiresAt" > "createdAt")
);

CREATE UNIQUE INDEX "erp_connection_tokens_tokenHash_key" ON "erp_connection_tokens"("tokenHash");
CREATE INDEX "erp_connection_tokens_userId_revokedAt_idx" ON "erp_connection_tokens"("userId", "revokedAt");
-- Includes expired keys until rotation explicitly revokes them; two concurrent issuances cannot both survive.
CREATE UNIQUE INDEX "erp_connection_tokens_active_user_key" ON "erp_connection_tokens"("userId")
    WHERE "revokedAt" IS NULL AND "userId" IS NOT NULL;

ALTER TABLE "erp_connection_tokens" ADD CONSTRAINT "erp_connection_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
