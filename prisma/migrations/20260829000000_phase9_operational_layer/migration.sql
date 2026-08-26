-- Phase 9 adds a durable, entity-independent activity trail and a small
-- operational settings record. Audit rows deliberately retain immutable actor
-- and entity labels when their source rows are permanently deleted.

CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID,
    "actorName" VARCHAR(160) NOT NULL,
    "actorEmail" VARCHAR(320) NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "entityType" VARCHAR(40) NOT NULL,
    "entityId" VARCHAR(80),
    "entityReference" VARCHAR(200) NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "application_settings" (
    "id" VARCHAR(40) NOT NULL DEFAULT 'company',
    "companyName" VARCHAR(160) NOT NULL,
    "companyReportingCurrencyCode" CHAR(3) NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "application_settings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_events_occurredAt_idx" ON "audit_events"("occurredAt");
CREATE INDEX "audit_events_actorId_occurredAt_idx" ON "audit_events"("actorId", "occurredAt");
CREATE INDEX "audit_events_action_occurredAt_idx" ON "audit_events"("action", "occurredAt");
CREATE INDEX "audit_events_entityType_occurredAt_idx" ON "audit_events"("entityType", "occurredAt");

-- Composite indexes support the primary Phase 9 list filters and deterministic
-- secondary ordering. Existing relationship/date indexes are retained.
CREATE INDEX "clients_isActive_displayName_idx" ON "clients"("isActive", "displayName");
CREATE INDEX "clients_countryCode_idx" ON "clients"("countryCode");
CREATE INDEX "clients_defaultCurrencyCode_idx" ON "clients"("defaultCurrencyCode");
CREATE INDEX "suppliers_isActive_displayName_idx" ON "suppliers"("isActive", "displayName");
CREATE INDEX "suppliers_countryCode_idx" ON "suppliers"("countryCode");
CREATE INDEX "suppliers_defaultCurrencyCode_idx" ON "suppliers"("defaultCurrencyCode");
CREATE INDEX "projects_status_name_idx" ON "projects"("status", "name");
CREATE INDEX "projects_clientId_status_idx" ON "projects"("clientId", "status");
CREATE INDEX "procurement_orders_projectId_status_idx" ON "procurement_orders"("projectId", "status");
CREATE INDEX "procurement_orders_supplierId_status_idx" ON "procurement_orders"("supplierId", "status");
CREATE INDEX "procurement_orders_orderCurrencyCode_idx" ON "procurement_orders"("orderCurrencyCode");
CREATE INDEX "procurement_orders_updatedAt_idx" ON "procurement_orders"("updatedAt");
CREATE INDEX "payment_installments_currencyCode_dueDate_idx" ON "payment_installments"("currencyCode", "dueDate");
CREATE INDEX "payment_installments_orderId_dueDate_idx" ON "payment_installments"("orderId", "dueDate");

ALTER TABLE "audit_events"
ADD CONSTRAINT "audit_events_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "application_settings"
ADD CONSTRAINT "application_settings_companyReportingCurrencyCode_fkey"
FOREIGN KEY ("companyReportingCurrencyCode") REFERENCES "currencies"("code")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "application_settings"
ADD CONSTRAINT "application_settings_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "application_settings"
ADD CONSTRAINT "application_settings_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
