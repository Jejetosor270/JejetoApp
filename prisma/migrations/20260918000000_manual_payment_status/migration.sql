-- Display-only overrides. NULL retains automatic payment status; cash records stay authoritative.
ALTER TABLE "procurement_orders" ADD COLUMN "paymentStatusOverride" VARCHAR(24);
ALTER TABLE "client_billing_documents" ADD COLUMN "paymentStatusOverride" VARCHAR(24);
ALTER TABLE "procurement_orders" ADD CONSTRAINT "orders_payment_status_override_check"
CHECK ("paymentStatusOverride" IS NULL OR "paymentStatusOverride" IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'));
ALTER TABLE "client_billing_documents" ADD CONSTRAINT "billing_payment_status_override_check"
CHECK ("paymentStatusOverride" IS NULL OR "paymentStatusOverride" IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'));
