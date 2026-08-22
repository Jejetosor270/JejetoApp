-- Existing Phase 1 seed identities were deliberately credential-less. Keeping them
-- inactive makes them available for historical references without treating them as
-- sign-in-capable employee accounts.
ALTER TABLE "users" ADD COLUMN "passwordHash" VARCHAR(255);

UPDATE "users"
SET "isActive" = false
WHERE "passwordHash" IS NULL;
