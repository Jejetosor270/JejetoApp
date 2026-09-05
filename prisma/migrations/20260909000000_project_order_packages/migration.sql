-- Preserve every historical free-text packageName. No inferred grouping/backfill.
CREATE TABLE "order_packages" (
 "id" UUID NOT NULL, "projectId" UUID NOT NULL, "name" VARCHAR(200) NOT NULL,
 "isActive" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 "createdById" UUID, "updatedById" UUID,
 CONSTRAINT "order_packages_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "order_packages_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "order_packages_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 CONSTRAINT "order_packages_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "order_packages_id_projectId_key" ON "order_packages"("id", "projectId");
CREATE UNIQUE INDEX "order_packages_projectId_name_key" ON "order_packages"("projectId", "name");
CREATE INDEX "order_packages_projectId_isActive_idx" ON "order_packages"("projectId", "isActive");
ALTER TABLE "procurement_orders" ADD COLUMN "packageId" UUID;
CREATE INDEX "procurement_orders_packageId_projectId_idx" ON "procurement_orders"("packageId", "projectId");
ALTER TABLE "procurement_orders" ADD CONSTRAINT "procurement_orders_packageId_projectId_fkey" FOREIGN KEY ("packageId", "projectId") REFERENCES "order_packages"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
