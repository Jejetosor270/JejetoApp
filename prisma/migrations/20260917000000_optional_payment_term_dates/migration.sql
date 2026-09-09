-- An undated payment term remains a commitment without a fabricated calendar date.
ALTER TABLE "payment_installments" ALTER COLUMN "dueDate" DROP NOT NULL;
ALTER TABLE "client_payment_installments" ALTER COLUMN "dueDate" DROP NOT NULL;
