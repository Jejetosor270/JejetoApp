-- Separate Supplier invoice date; never infer it from historical Order/Quote dates.
ALTER TABLE "procurement_orders" ADD COLUMN "invoiceDate" DATE;
