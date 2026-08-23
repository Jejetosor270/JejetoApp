-- Keep the data conversion and schema replacement atomic. The first failed
-- production attempt stopped at its opening guard, before changing the schema.
BEGIN;

-- Phase 1 stored supplier schedules by Order, but client schedules by Project.
-- Phase 6 requires every schedule to belong to an Order. Refuse to invent a
-- client allocation unless its Project has exactly one Order, and refuse rows
-- that cannot satisfy the stronger Phase 6 amount/date/currency invariants.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "supplier_payment_installments"
        WHERE "expectedAmount" IS NULL
           OR "expectedAmount" <= 0
           OR "expectedDueDate" IS NULL
    ) THEN
        RAISE EXCEPTION 'Legacy supplier installments require a positive expected amount and due date before Phase 6 conversion.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "client_payment_installments"
        WHERE "expectedAmount" IS NULL
           OR "expectedAmount" <= 0
           OR "expectedDate" IS NULL
    ) THEN
        RAISE EXCEPTION 'Legacy client installments require a positive expected amount and due date before Phase 6 conversion.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "client_payment_installments" AS installment
        WHERE (
            SELECT COUNT(*)
            FROM "procurement_orders" AS orders
            WHERE orders."projectId" = installment."projectId"
        ) <> 1
    ) THEN
        RAISE EXCEPTION 'A legacy client installment Project does not have exactly one Order; automatic Phase 6 allocation would be ambiguous.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "supplier_payment_installments" AS installment
        JOIN "procurement_orders" AS orders ON orders."id" = installment."orderId"
        JOIN "projects" AS projects ON projects."id" = orders."projectId"
        WHERE installment."reportingCurrencyCode" <> projects."reportingCurrencyCode"
    ) OR EXISTS (
        SELECT 1
        FROM "client_payment_installments" AS installment
        JOIN "projects" AS projects ON projects."id" = installment."projectId"
        WHERE installment."reportingCurrencyCode" <> projects."reportingCurrencyCode"
    ) THEN
        RAISE EXCEPTION 'A legacy installment reporting currency differs from its Project reporting currency.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "supplier_payments" AS settlement
        JOIN "supplier_payment_installments" AS installment
          ON installment."id" = settlement."installmentId"
        WHERE settlement."currencyCode" <> installment."currencyCode"
           OR settlement."reportingCurrencyCode" <> installment."reportingCurrencyCode"
    ) OR EXISTS (
        SELECT 1
        FROM "client_receipts" AS settlement
        JOIN "client_payment_installments" AS installment
          ON installment."id" = settlement."installmentId"
        WHERE settlement."currencyCode" <> installment."currencyCode"
           OR settlement."reportingCurrencyCode" <> installment."reportingCurrencyCode"
    ) THEN
        RAISE EXCEPTION 'A legacy settlement currency differs from its parent installment currency.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "supplier_payment_installments" AS installment
        WHERE COALESCE((
            SELECT SUM(settlement."amount")
            FROM "supplier_payments" AS settlement
            WHERE settlement."installmentId" = installment."id"
        ), 0) > installment."expectedAmount"
    ) OR EXISTS (
        SELECT 1
        FROM "client_payment_installments" AS installment
        WHERE COALESCE((
            SELECT SUM(settlement."amount")
            FROM "client_receipts" AS settlement
            WHERE settlement."installmentId" = installment."id"
        ), 0) > installment."expectedAmount"
    ) THEN
        RAISE EXCEPTION 'A legacy installment is over-settled and cannot satisfy Phase 6 outstanding-amount invariants.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "supplier_payment_installments" AS supplier
        JOIN "client_payment_installments" AS client ON client."id" = supplier."id"
    ) OR EXISTS (
        SELECT 1
        FROM "supplier_payments" AS supplier
        JOIN "client_receipts" AS client ON client."id" = supplier."id"
    ) THEN
        RAISE EXCEPTION 'Legacy supplier and client payment records contain duplicate IDs.';
    END IF;
END $$;

CREATE TYPE "PaymentDirection" AS ENUM ('SUPPLIER_PAYMENT', 'CLIENT_RECEIPT');
CREATE TYPE "InstallmentBasis" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

CREATE TABLE "payment_installments" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "basis" "InstallmentBasis" NOT NULL,
    "percentageRate" DECIMAL(9,6),
    "scheduledAmount" DECIMAL(19,4) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "dueDate" DATE NOT NULL,
    "expectedFxRateToReporting" DECIMAL(20,10),
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "payment_installments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_installments_sequence_check" CHECK ("sequence" > 0),
    CONSTRAINT "payment_installments_amount_check" CHECK ("scheduledAmount" > 0),
    CONSTRAINT "payment_installments_fx_check" CHECK (
        "expectedFxRateToReporting" IS NULL OR "expectedFxRateToReporting" > 0
    ),
    CONSTRAINT "payment_installments_basis_check" CHECK (
        ("basis" = 'PERCENTAGE' AND "percentageRate" IS NOT NULL AND "percentageRate" > 0 AND "percentageRate" <= 1)
        OR ("basis" = 'FIXED_AMOUNT' AND "percentageRate" IS NULL)
    )
);

CREATE TABLE "payment_settlements" (
    "id" UUID NOT NULL,
    "installmentId" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "settledAt" DATE NOT NULL,
    "fxRateToReporting" DECIMAL(20,10),
    "reference" VARCHAR(120),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "payment_settlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_settlements_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "payment_settlements_fx_check" CHECK (
        "fxRateToReporting" IS NULL OR "fxRateToReporting" > 0
    )
);

CREATE UNIQUE INDEX "payment_installments_orderId_direction_sequence_key"
    ON "payment_installments"("orderId", "direction", "sequence");
CREATE INDEX "payment_installments_orderId_direction_idx"
    ON "payment_installments"("orderId", "direction");
CREATE INDEX "payment_installments_direction_dueDate_idx"
    ON "payment_installments"("direction", "dueDate");
CREATE INDEX "payment_settlements_installmentId_settledAt_idx"
    ON "payment_settlements"("installmentId", "settledAt");

ALTER TABLE "payment_installments"
    ADD CONSTRAINT "payment_installments_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "procurement_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "payment_installments_currencyCode_fkey"
    FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "payment_installments_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "payment_installments_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_settlements"
    ADD CONSTRAINT "payment_settlements_installmentId_fkey"
    FOREIGN KEY ("installmentId") REFERENCES "payment_installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "payment_settlements_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "payment_settlements_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Supplier installments were already Order-scoped, so their identifiers,
-- sequence, amounts, dates, currencies, FX, audit data, and cancellation can
-- be preserved directly. A legacy percentage remains the authoritative basis;
-- otherwise the preserved expected amount becomes a fixed amount.
INSERT INTO "payment_installments" (
    "id",
    "orderId",
    "direction",
    "sequence",
    "label",
    "basis",
    "percentageRate",
    "scheduledAmount",
    "currencyCode",
    "dueDate",
    "expectedFxRateToReporting",
    "isCancelled",
    "notes",
    "createdAt",
    "updatedAt",
    "createdById",
    "updatedById"
)
SELECT
    installment."id",
    installment."orderId",
    'SUPPLIER_PAYMENT'::"PaymentDirection",
    installment."sequence",
    installment."description",
    CASE
        WHEN installment."percentageRate" IS NOT NULL
            THEN 'PERCENTAGE'::"InstallmentBasis"
        ELSE 'FIXED_AMOUNT'::"InstallmentBasis"
    END,
    installment."percentageRate",
    installment."expectedAmount",
    installment."currencyCode",
    installment."expectedDueDate",
    installment."expectedFxRate",
    installment."status" = 'CANCELLED'::"PaymentStatus",
    installment."notes",
    installment."createdAt",
    installment."updatedAt",
    installment."createdById",
    installment."updatedById"
FROM "supplier_payment_installments" AS installment;

-- A preflight check above guarantees one unambiguous Order for every legacy
-- project-level client installment. Preserve its optional schedule reference
-- in notes because Phase 6 keeps references on actual settlements instead.
INSERT INTO "payment_installments" (
    "id",
    "orderId",
    "direction",
    "sequence",
    "label",
    "basis",
    "percentageRate",
    "scheduledAmount",
    "currencyCode",
    "dueDate",
    "expectedFxRateToReporting",
    "isCancelled",
    "notes",
    "createdAt",
    "updatedAt",
    "createdById",
    "updatedById"
)
SELECT
    installment."id",
    orders."id",
    'CLIENT_RECEIPT'::"PaymentDirection",
    installment."sequence",
    installment."description",
    CASE
        WHEN installment."percentageRate" IS NOT NULL
            THEN 'PERCENTAGE'::"InstallmentBasis"
        ELSE 'FIXED_AMOUNT'::"InstallmentBasis"
    END,
    installment."percentageRate",
    installment."expectedAmount",
    installment."currencyCode",
    installment."expectedDate",
    installment."expectedFxRate",
    installment."status" = 'CANCELLED'::"PaymentStatus",
    CASE
        WHEN installment."reference" IS NULL THEN installment."notes"
        WHEN installment."notes" IS NULL THEN 'Legacy schedule reference: ' || installment."reference"
        ELSE installment."notes" || E'\nLegacy schedule reference: ' || installment."reference"
    END,
    installment."createdAt",
    installment."updatedAt",
    installment."createdById",
    installment."updatedById"
FROM "client_payment_installments" AS installment
JOIN "procurement_orders" AS orders ON orders."projectId" = installment."projectId";

INSERT INTO "payment_settlements" (
    "id",
    "installmentId",
    "amount",
    "settledAt",
    "fxRateToReporting",
    "reference",
    "notes",
    "createdAt",
    "updatedAt",
    "createdById",
    "updatedById"
)
SELECT
    settlement."id",
    settlement."installmentId",
    settlement."amount",
    settlement."paidAt",
    settlement."fxRateToReporting",
    settlement."paymentReference",
    settlement."notes",
    settlement."createdAt",
    settlement."updatedAt",
    settlement."createdById",
    settlement."updatedById"
FROM "supplier_payments" AS settlement;

INSERT INTO "payment_settlements" (
    "id",
    "installmentId",
    "amount",
    "settledAt",
    "fxRateToReporting",
    "reference",
    "notes",
    "createdAt",
    "updatedAt",
    "createdById",
    "updatedById"
)
SELECT
    settlement."id",
    settlement."installmentId",
    settlement."amount",
    settlement."receivedAt",
    settlement."fxRateToReporting",
    settlement."receiptReference",
    settlement."notes",
    settlement."createdAt",
    settlement."updatedAt",
    settlement."createdById",
    settlement."updatedById"
FROM "client_receipts" AS settlement;

-- Verify every legacy schedule and settlement reached the new model before
-- removing only the obsolete payment scaffold.
DO $$
BEGIN
    IF (SELECT COUNT(*) FROM "payment_installments" WHERE "direction" = 'SUPPLIER_PAYMENT')
       <> (SELECT COUNT(*) FROM "supplier_payment_installments")
       OR (SELECT COUNT(*) FROM "payment_installments" WHERE "direction" = 'CLIENT_RECEIPT')
       <> (SELECT COUNT(*) FROM "client_payment_installments")
       OR (
           SELECT COUNT(*)
           FROM "payment_settlements" AS settlement
           JOIN "payment_installments" AS installment ON installment."id" = settlement."installmentId"
           WHERE installment."direction" = 'SUPPLIER_PAYMENT'
       ) <> (SELECT COUNT(*) FROM "supplier_payments")
       OR (
           SELECT COUNT(*)
           FROM "payment_settlements" AS settlement
           JOIN "payment_installments" AS installment ON installment."id" = settlement."installmentId"
           WHERE installment."direction" = 'CLIENT_RECEIPT'
       ) <> (SELECT COUNT(*) FROM "client_receipts") THEN
        RAISE EXCEPTION 'Legacy payment conversion count verification failed; no Phase 6 changes were committed.';
    END IF;
END $$;

DROP TABLE "supplier_payments";
DROP TABLE "supplier_payment_installments";
DROP TABLE "client_receipts";
DROP TABLE "client_payment_installments";
DROP TYPE "PaymentStatus";

COMMIT;
