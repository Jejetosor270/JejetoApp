-- Added date is employee-editable; immutable creation history remains unchanged.
ALTER TABLE "procurement_orders" ADD COLUMN "addedDate" DATE;

-- Prisma timestamps are stored as UTC without a time zone. Preserve the actual
-- Paris creation day for historical records, including records in Trash.
UPDATE "procurement_orders"
SET "addedDate" = (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date;

ALTER TABLE "procurement_orders"
  ALTER COLUMN "addedDate" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Paris')::date,
  ALTER COLUMN "addedDate" SET NOT NULL;

CREATE INDEX "procurement_orders_addedDate_idx" ON "procurement_orders"("addedDate");
