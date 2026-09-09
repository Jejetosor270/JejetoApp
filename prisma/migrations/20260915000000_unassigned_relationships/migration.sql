ALTER TABLE "projects" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "buildings" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "procurement_orders" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "procurement_orders" ALTER COLUMN "supplierId" DROP NOT NULL;
-- Retain the exact calculated allowance when freezing an inherited percentage amount.
ALTER TABLE "procurement_orders" ALTER COLUMN "freightAllowanceOverrideAmount" TYPE DECIMAL(38,20);
ALTER TABLE "procurement_orders" ADD COLUMN "detachedReportingCurrencyCode" CHAR(3) REFERENCES currencies(code) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_freight_expenses" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "project_freight_expenses" ADD COLUMN "detachedReportingCurrencyCode" CHAR(3) REFERENCES currencies(code) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_installments" ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE "payment_installments" ADD COLUMN "detachedReportingCurrencyCode" CHAR(3) REFERENCES currencies(code) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_billing_documents" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "client_billing_documents" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "client_billing_documents" ADD COLUMN "detachedReportingCurrencyCode" CHAR(3) REFERENCES currencies(code) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_payment_installments" ALTER COLUMN "billingDocumentId" DROP NOT NULL;
ALTER TABLE "client_payment_installments" ADD COLUMN "detachedReportingCurrencyCode" CHAR(3) REFERENCES currencies(code) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rooms" ALTER COLUMN "buildingId" DROP NOT NULL;
ALTER TABLE "items" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "items" ADD COLUMN "detachedReportingCurrencyCode" CHAR(3) REFERENCES currencies(code) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_packages" ALTER COLUMN "projectId" DROP NOT NULL;

-- A removed parent must never erase the currency against which historical FX was entered.
ALTER TABLE "procurement_orders" ADD CONSTRAINT "orders_retained_context" CHECK (
  "projectId" IS NOT NULL OR (
    "detachedReportingCurrencyCode" IS NOT NULL AND
    "productMarkupOverrideRate" IS NOT NULL AND "freightMarkupOverrideRate" IS NOT NULL AND
    "otherCostMarkupOverrideRate" IS NOT NULL AND "pricingMode" <> 'PROJECT_MARKUP'
  )
);
ALTER TABLE "client_billing_documents" ADD CONSTRAINT "billing_retained_context" CHECK ("projectId" IS NOT NULL OR "detachedReportingCurrencyCode" IS NOT NULL);
ALTER TABLE "payment_installments" ADD CONSTRAINT "supplier_installment_retained_context" CHECK ("orderId" IS NOT NULL OR "detachedReportingCurrencyCode" IS NOT NULL);
ALTER TABLE "client_payment_installments" ADD CONSTRAINT "client_installment_retained_context" CHECK ("billingDocumentId" IS NOT NULL OR "detachedReportingCurrencyCode" IS NOT NULL);
ALTER TABLE "items" ADD CONSTRAINT "item_retained_context" CHECK ("projectId" IS NOT NULL OR "detachedReportingCurrencyCode" IS NOT NULL);
ALTER TABLE "project_freight_expenses" ADD CONSTRAINT "freight_retained_context" CHECK ("projectId" IS NOT NULL OR "detachedReportingCurrencyCode" IS NOT NULL);
