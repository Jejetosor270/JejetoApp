ALTER TABLE "clients" ADD COLUMN "trashedAt" TIMESTAMP(3);
CREATE INDEX "clients_trashedAt_idx" ON "clients"("trashedAt");
ALTER TABLE "suppliers" ADD COLUMN "trashedAt" TIMESTAMP(3);
CREATE INDEX "suppliers_trashedAt_idx" ON "suppliers"("trashedAt");
ALTER TABLE "projects" ADD COLUMN "trashedAt" TIMESTAMP(3);
CREATE INDEX "projects_trashedAt_idx" ON "projects"("trashedAt");
ALTER TABLE "buildings" ADD COLUMN "trashedAt" TIMESTAMP(3);
CREATE INDEX "buildings_trashedAt_idx" ON "buildings"("trashedAt");
ALTER TABLE "procurement_orders" ADD COLUMN "trashedAt" TIMESTAMP(3);
CREATE INDEX "procurement_orders_trashedAt_idx" ON "procurement_orders"("trashedAt");
ALTER TABLE "project_freight_expenses" ADD COLUMN "trashedAt" TIMESTAMP(3);
CREATE INDEX "project_freight_expenses_trashedAt_idx" ON "project_freight_expenses"("trashedAt");
ALTER TABLE "payment_installments" ADD COLUMN "trashedAt" TIMESTAMP(3);
CREATE INDEX "payment_installments_trashedAt_idx" ON "payment_installments"("trashedAt");
ALTER TABLE "payment_settlements" ADD COLUMN "trashedAt" TIMESTAMP(3);
CREATE INDEX "payment_settlements_trashedAt_idx" ON "payment_settlements"("trashedAt");
ALTER TABLE "client_billing_documents" ADD COLUMN "trashedAt" TIMESTAMP(3);
CREATE INDEX "client_billing_documents_trashedAt_idx" ON "client_billing_documents"("trashedAt");
ALTER TABLE "client_payment_installments" ADD COLUMN "trashedAt" TIMESTAMP(3);
CREATE INDEX "client_payment_installments_trashedAt_idx" ON "client_payment_installments"("trashedAt");
ALTER TABLE "client_receipts" ADD COLUMN "trashedAt" TIMESTAMP(3);
CREATE INDEX "client_receipts_trashedAt_idx" ON "client_receipts"("trashedAt");
ALTER TABLE "rooms" ADD COLUMN "trashedAt" TIMESTAMP(3);
CREATE INDEX "rooms_trashedAt_idx" ON "rooms"("trashedAt");
ALTER TABLE "items" ADD COLUMN "trashedAt" TIMESTAMP(3);
CREATE INDEX "items_trashedAt_idx" ON "items"("trashedAt");
ALTER TABLE "order_packages" ADD COLUMN "trashedAt" TIMESTAMP(3);
CREATE INDEX "order_packages_trashedAt_idx" ON "order_packages"("trashedAt");
CREATE TABLE "trash_batches" (
 "id" UUID NOT NULL, "label" VARCHAR(255) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdById" UUID, "restoredAt" TIMESTAMP(3), "restoredById" UUID, CONSTRAINT "trash_batches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "trash_batches_restoredAt_createdAt_idx" ON "trash_batches"("restoredAt", "createdAt");
CREATE TABLE "trash_records" (
 "id" UUID NOT NULL, "batchId" UUID NOT NULL, "model" VARCHAR(80) NOT NULL, "recordId" UUID NOT NULL,
 CONSTRAINT "trash_records_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "trash_records_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "trash_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "trash_records_batchId_model_recordId_key" ON "trash_records"("batchId", "model", "recordId");
CREATE INDEX "trash_records_model_recordId_idx" ON "trash_records"("model", "recordId");
CREATE TABLE "trash_dependencies" (
 "id" UUID NOT NULL, "batchId" UUID NOT NULL, "model" VARCHAR(80) NOT NULL, "recordId" UUID NOT NULL, "signature" VARCHAR(32) NOT NULL,
 CONSTRAINT "trash_dependencies_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "trash_dependencies_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "trash_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "trash_dependencies_batchId_model_recordId_key" ON "trash_dependencies"("batchId", "model", "recordId");
