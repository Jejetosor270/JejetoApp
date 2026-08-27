-- Phase 10 introduces project-specific items, rooms, operational logistics
-- locations, and structured import history. Existing Order financial records
-- remain authoritative and are not derived from Item rows.

CREATE TYPE "ItemCommercialStatus" AS ENUM ('BUDGET', 'QUOTED', 'SELECTED', 'ORDERED', 'CANCELLED');
CREATE TYPE "ItemLogisticsStatus" AS ENUM ('PENDING', 'IN_PRODUCTION', 'IN_TRANSIT', 'RECEIVED_FABRICATOR', 'RECEIVED_WAREHOUSE', 'DELIVERED_RESIDENCE', 'INSTALLED', 'CLAIM');
CREATE TYPE "LogisticsLocationType" AS ENUM ('WAREHOUSE', 'FABRICATOR', 'PROJECT_SITE', 'OTHER');
CREATE TYPE "ItemSourceType" AS ENUM ('MANUAL', 'BUDGET_XLSX', 'SUPPLIER_QUOTE_PDF');

ALTER TABLE "projects"
ADD COLUMN "freightEstimateRate" DECIMAL(9,6),
ADD COLUMN "freightEstimateNotes" VARCHAR(500);

CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "buildingId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(40),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,
    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "logistics_locations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "type" "LogisticsLocationType" NOT NULL,
    "addressLine1" VARCHAR(200),
    "addressLine2" VARCHAR(200),
    "city" VARCHAR(120),
    "postalCode" VARCHAR(32),
    "countryCode" CHAR(2),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,
    CONSTRAINT "logistics_locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "item_imports" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "supplierId" UUID,
    "procurementOrderId" UUID,
    "sourceType" "ItemSourceType" NOT NULL,
    "originalFilename" VARCHAR(255) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" UUID,
    "rowCount" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL,
    "updatedCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "warningCount" INTEGER NOT NULL,
    "extractionProvider" VARCHAR(50),
    "extractionModel" VARCHAR(120),
    "mappingMetadata" JSONB,
    CONSTRAINT "item_imports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "items" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "buildingId" UUID,
    "roomId" UUID,
    "supplierId" UUID,
    "procurementOrderId" UUID,
    "importId" UUID,
    "sourceType" "ItemSourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceSheet" VARCHAR(120),
    "sourceRowNumber" INTEGER,
    "sourceReference" VARCHAR(120),
    "itemReference" VARCHAR(120),
    "supplierSku" VARCHAR(160),
    "name" VARCHAR(240) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(80),
    "brand" VARCHAR(160),
    "finishColor" VARCHAR(240),
    "notes" TEXT,
    "quantity" DECIMAL(19,4) NOT NULL DEFAULT 1,
    "unitOfMeasure" VARCHAR(24) NOT NULL DEFAULT 'EA',
    "weightEach" DECIMAL(19,4),
    "totalWeight" DECIMAL(19,4),
    "volumeEach" DECIMAL(19,4),
    "totalVolume" DECIMAL(19,4),
    "purchaseCurrencyCode" CHAR(3),
    "unitPurchasePriceHt" DECIMAL(19,4),
    "totalPurchasePriceHt" DECIMAL(19,4),
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'SELLING_PRICE',
    "targetMarginRate" DECIMAL(9,6),
    "unitSellingPriceHt" DECIMAL(19,4),
    "totalSellingPriceHt" DECIMAL(19,4),
    "vatTreatment" "VatTreatment",
    "vatRecoverability" "VatRecoverability",
    "vatRate" DECIMAL(9,6),
    "vatAmount" DECIMAL(19,4),
    "commercialStatus" "ItemCommercialStatus" NOT NULL DEFAULT 'BUDGET',
    "logisticsStatus" "ItemLogisticsStatus" NOT NULL DEFAULT 'PENDING',
    "estimatedWarehouseDate" DATE,
    "estimatedFabricatorDate" DATE,
    "receivedFabricatorDate" DATE,
    "receivedWarehouseDate" DATE,
    "inTransitDate" DATE,
    "estimatedResidenceDate" DATE,
    "deliveredResidenceDate" DATE,
    "installedDate" DATE,
    "expectedWarehouseId" UUID,
    "receivedWarehouseId" UUID,
    "fabricatorId" UUID,
    "destinationLocationId" UUID,
    "issueDescription" TEXT,
    "claimStatus" VARCHAR(120),
    "claimOpenedDate" DATE,
    "claimResolvedDate" DATE,
    "claimNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,
    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rooms_buildingId_name_key" ON "rooms"("buildingId", "name");
CREATE UNIQUE INDEX "rooms_buildingId_code_key" ON "rooms"("buildingId", "code");
CREATE INDEX "rooms_buildingId_isActive_idx" ON "rooms"("buildingId", "isActive");
CREATE INDEX "logistics_locations_type_isActive_idx" ON "logistics_locations"("type", "isActive");
CREATE INDEX "logistics_locations_name_idx" ON "logistics_locations"("name");
CREATE INDEX "item_imports_projectId_importedAt_idx" ON "item_imports"("projectId", "importedAt");
CREATE INDEX "item_imports_supplierId_idx" ON "item_imports"("supplierId");
CREATE INDEX "item_imports_procurementOrderId_idx" ON "item_imports"("procurementOrderId");
CREATE INDEX "item_imports_sourceType_idx" ON "item_imports"("sourceType");
CREATE INDEX "items_projectId_idx" ON "items"("projectId");
CREATE INDEX "items_buildingId_idx" ON "items"("buildingId");
CREATE INDEX "items_roomId_idx" ON "items"("roomId");
CREATE INDEX "items_supplierId_idx" ON "items"("supplierId");
CREATE INDEX "items_procurementOrderId_idx" ON "items"("procurementOrderId");
CREATE INDEX "items_commercialStatus_idx" ON "items"("commercialStatus");
CREATE INDEX "items_logisticsStatus_idx" ON "items"("logisticsStatus");
CREATE INDEX "items_itemReference_idx" ON "items"("itemReference");
CREATE INDEX "items_supplierSku_idx" ON "items"("supplierSku");
CREATE INDEX "items_importId_idx" ON "items"("importId");
CREATE INDEX "items_projectId_commercialStatus_idx" ON "items"("projectId", "commercialStatus");
CREATE INDEX "items_projectId_updatedAt_idx" ON "items"("projectId", "updatedAt");

ALTER TABLE "rooms" ADD CONSTRAINT "rooms_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "logistics_locations" ADD CONSTRAINT "logistics_locations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "logistics_locations" ADD CONSTRAINT "logistics_locations_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "item_imports" ADD CONSTRAINT "item_imports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "item_imports" ADD CONSTRAINT "item_imports_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "item_imports" ADD CONSTRAINT "item_imports_procurementOrderId_fkey" FOREIGN KEY ("procurementOrderId") REFERENCES "procurement_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "item_imports" ADD CONSTRAINT "item_imports_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_procurementOrderId_fkey" FOREIGN KEY ("procurementOrderId") REFERENCES "procurement_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_importId_fkey" FOREIGN KEY ("importId") REFERENCES "item_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_purchaseCurrencyCode_fkey" FOREIGN KEY ("purchaseCurrencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_expectedWarehouseId_fkey" FOREIGN KEY ("expectedWarehouseId") REFERENCES "logistics_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_receivedWarehouseId_fkey" FOREIGN KEY ("receivedWarehouseId") REFERENCES "logistics_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_fabricatorId_fkey" FOREIGN KEY ("fabricatorId") REFERENCES "logistics_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "logistics_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
