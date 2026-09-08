ALTER TABLE "client_billing_documents" ADD COLUMN "freightCoverageHt" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD CONSTRAINT "billing_freight_within_total" CHECK ("freightCoverageHt" >= 0 AND "freightCoverageHt" <= "totalHt");
ALTER TABLE "client_billing_allocations" ADD COLUMN "freightCoverageHt" DECIMAL(19,4) NOT NULL DEFAULT 0,
ADD CONSTRAINT "allocation_freight_within_total" CHECK ("freightCoverageHt" >= 0 AND "freightCoverageHt" <= "allocatedAmount");
