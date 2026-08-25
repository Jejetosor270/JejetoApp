CREATE TYPE "SupplierQuoteImportAction" AS ENUM ('CREATED_ORDER', 'UPDATED_ORDER');

CREATE TABLE "supplier_quote_imports" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "originalFilename" VARCHAR(255) NOT NULL,
    "supplierQuoteReference" VARCHAR(120),
    "quoteDate" DATE,
    "leadTimeRaw" VARCHAR(500),
    "paymentTermsRaw" TEXT,
    "extractionProvider" VARCHAR(50) NOT NULL,
    "extractionModel" VARCHAR(120) NOT NULL,
    "action" "SupplierQuoteImportAction" NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedById" UUID,

    CONSTRAINT "supplier_quote_imports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_quote_imports_orderId_processedAt_idx" ON "supplier_quote_imports"("orderId", "processedAt");
CREATE INDEX "supplier_quote_imports_projectId_idx" ON "supplier_quote_imports"("projectId");
CREATE INDEX "supplier_quote_imports_supplierId_idx" ON "supplier_quote_imports"("supplierId");

ALTER TABLE "supplier_quote_imports" ADD CONSTRAINT "supplier_quote_imports_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "procurement_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_quote_imports" ADD CONSTRAINT "supplier_quote_imports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_quote_imports" ADD CONSTRAINT "supplier_quote_imports_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_quote_imports" ADD CONSTRAINT "supplier_quote_imports_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
